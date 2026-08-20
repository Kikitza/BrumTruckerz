-- ─────────────────────────────────────────────────────────────────────────────
-- 0017 — TEMELJ IDENTITETA (F1 kriška 1). Po potpisanim ADR 0001/0002/0003.
--
-- Uvodi trajni identitet vozača/dispečera-GRAĐANINA iznad firme:
--   (A) generator javnih brojeva (sekvenca + format) — temelj za BT-D sada i BT-T
--       kasnije (ADR 0006);
--   (B) driver_profiles / dispatcher_profiles — trajni profil vezan za NALOG
--       (app_users), ne za telefon; javni broj 'BT-D-#####' (dispečer po potrebi);
--   (C) employments — osoba ↔ firma sa istorijom (od–do), role_on_company
--       driver|dispatcher; NIKAD delete (zatvaranje = ended_at + status);
--   (D) RLS: profil vidi sebe; firma vidi svoje zaposlenje/profile; platform_admin
--       samo meta; RESTRICTIVE suspend-gate na upis zaposlenja (kao 0015);
--   (E) idempotentan backfill: svaki DEV vozač (drivers.user_id) dobija profil +
--       aktivno zaposlenje.
--
-- MOST (bridge): app_users.company_id i drivers.user_id OSTAJU izvor istine pristupa
-- u ovoj krišci. Nijedna postojeća politika/RPC/pogled se ne dira → nula promena u
-- ponašanju aplikacije. Prebacivanje tokova na profil/zaposlenje su naredne kriške.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- (A) Generator javnih brojeva: format (immutable) + sekvenca po entitetu.
--     BT-T (ture) kasnije koristi ISTI format_public_no('T', …) + svoju sekvencu.
-- ─────────────────────────────────────────────────────────────
create or replace function public.format_public_no(p_prefix text, p_n bigint)
  returns text language sql immutable as $$
  select 'BT-' || upper(p_prefix) || '-' || lpad(p_n::text, 5, '0')
$$;

create sequence if not exists public.driver_public_no_seq;

create or replace function public.next_driver_public_no()
  returns text language sql volatile as $$
  select public.format_public_no('D', nextval('public.driver_public_no_seq'))
$$;

-- ─────────────────────────────────────────────────────────────
-- (B) Profili građana. Ime NIJE jedinstveno; telefon ostaje u app_users (promenjiv,
--     nije ključ). Javni broj je trajan i ne recikliramo ga (ADR 0001).
-- ─────────────────────────────────────────────────────────────
create table driver_profiles (
  user_id      uuid primary key references app_users(id) on delete cascade,
  public_no    text not null unique default public.next_driver_public_no(),  -- 'BT-D-#####'
  display_name text,
  created_at   timestamptz not null default now()
);

-- Dispečer analogno; broj „po potrebi" (ADR 0001) → nullable, bez auto-generatora
-- dok dispečerska uloga ne sleti (ADR 0003, naredna kriška).
create table dispatcher_profiles (
  user_id      uuid primary key references app_users(id) on delete cascade,
  public_no    text unique,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- (C) Zaposlenja: istorija osoba↔firma. status='active' ⇔ ended_at is null.
-- ─────────────────────────────────────────────────────────────
create table employments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  user_id         uuid not null references app_users(id) on delete cascade,
  role_on_company text not null check (role_on_company in ('driver','dispatcher')),
  started_at      date not null default current_date,
  ended_at        date,                              -- null = aktivno
  status          text not null default 'active' check (status in ('active','ended')),
  created_at      timestamptz not null default now(),
  constraint employments_status_ended_ck
    check ((status = 'active' and ended_at is null)
        or (status = 'ended'  and ended_at is not null)),
  unique (user_id, company_id, started_at)
);
-- Najviše JEDNO aktivno zaposlenje po (osoba, firma) — „tačno jedno aktivno".
create unique index employments_one_active_uidx
  on employments (user_id, company_id) where status = 'active';
create index on employments (company_id, status);
create index on employments (user_id, ended_at);

-- ─────────────────────────────────────────────────────────────
-- (D) RLS
-- ─────────────────────────────────────────────────────────────
alter table driver_profiles     enable row level security;
alter table dispatcher_profiles enable row level security;
alter table employments         enable row level security;

-- Firma osobe (bridge) preko definer helpera → bez RLS rekurzije u politikama.
create or replace function public.profile_company_id(p_user uuid) returns uuid
  language sql stable security definer set search_path = public as $$
  select company_id from app_users where id = p_user
$$;

-- Profil: osoba vidi sebe; vlasnik svoje firme; platform_admin (meta).
create policy driver_profiles_read on driver_profiles for select using (
  user_id = auth.uid()
  or (current_role_name() = 'owner' and profile_company_id(user_id) = current_company_id())
  or current_role_name() = 'platform_admin'
);
create policy dispatcher_profiles_read on dispatcher_profiles for select using (
  user_id = auth.uid()
  or (current_role_name() = 'owner' and profile_company_id(user_id) = current_company_id())
  or current_role_name() = 'platform_admin'
);
-- Upis profila: NEMA politike za obične uloge → backfill ide kao postgres, a budući
-- tok (prihvatanje pozivnice) kroz SECURITY DEFINER RPC (naredna kriška).

-- Zaposlenja: osoba vidi svoja; firma vidi svoja; platform_admin (meta).
create policy employments_read on employments for select using (
  user_id = auth.uid()
  or (current_role_name() = 'owner' and company_id = current_company_id())
  or current_role_name() = 'platform_admin'
);
-- Vlasnik upisuje/zatvara zaposlenja SVOJE firme (temelj; app ga još ne zove).
-- Nema DELETE politike → brisanje je zabranjeno (istorija se čuva; kraj = UPDATE).
create policy employments_insert_owner on employments for insert with check (
  current_role_name() = 'owner' and company_id = current_company_id()
);
create policy employments_update_owner on employments for update using (
  current_role_name() = 'owner' and company_id = current_company_id()
) with check (
  current_role_name() = 'owner' and company_id = current_company_id()
);

-- RESTRICTIVE suspend-gate na upis zaposlenja (obrazac iz 0015).
create policy employments_active_insert on employments as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy employments_active_update on employments as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

-- ─────────────────────────────────────────────────────────────
-- (E) BACKFILL (idempotentno). Cilj: svaki vozač-nalog (drivers.user_id) dobija
--     trajni profil + AKTIVNO zaposlenje. `where not exists` → nema dvostrukog upisa
--     ni „potrošenog" broja pri ponovnom pokretanju. Vlasnik je principal firme, nije
--     employment-građanin (role_on_company ∈ {driver,dispatcher}) → njega ne diramo.
-- ─────────────────────────────────────────────────────────────
insert into driver_profiles (user_id, display_name)
select d.user_id, d.full_name
  from drivers d
 where d.user_id is not null
   and not exists (select 1 from driver_profiles p where p.user_id = d.user_id);

insert into employments (company_id, user_id, role_on_company, started_at, status)
select d.company_id, d.user_id, 'driver', d.created_at::date, 'active'
  from drivers d
 where d.user_id is not null
   and not exists (
     select 1 from employments e
      where e.user_id = d.user_id and e.company_id = d.company_id and e.status = 'active'
   );
