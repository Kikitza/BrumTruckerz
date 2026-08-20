-- ─────────────────────────────────────────────────────────────────────────────
-- 0018 — POZIVNICE (F1 kriška 2). Vlasnik generiše KOD, osobu ubacuje kodom.
--
-- Obim: SLANJE (email/SMS) NIJE ovde — vlasnik kod prosleđuje sam (usmeno/poruka);
-- kanali dostave stižu sa K3/K4.
--
--   (A) generator koda: 8 znakova, alfabet bez O/0/I/1, jedinstven MEĐU AKTIVNIM
--       (status='pending') — partial-unique indeks + retry u generatoru;
--   (B) tabela invitations (firma, uloga driver|dispatcher, kod, ime/kontakt info,
--       istek +7 dana, status pending|accepted|cancelled|expired). NIKAD delete
--       (otkaz = status='cancelled'); istorija se čuva;
--   (C) RLS: vlasnik SVOJE firme insert/select/cancel; platform_admin meta; PRIMALAC
--       NE čita tabelu (prihvatanje ide kroz SECURITY DEFINER RPC); RESTRICTIVE
--       suspend-gate na upis (obrazac iz 0015);
--   (D) accept_invitation(p_code) — validacija + MOST za vozača (app_users.company_id,
--       drivers red — bez duplikata: „lekcija blizanaca") + profil + aktivno zaposlenje.
--
-- MOST (bridge): app_users.company_id i drivers.user_id OSTAJU izvor istine pristupa.
-- Zato accept_invitation za vozača postavlja upravo njih; dispečerska PRAVA (uloga u
-- enum-u user_role, pristup) stižu u K4 — ovde se dispečeru upisuje samo identitet
-- (profil) + zaposlenje.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- (A) Generator koda. SECURITY DEFINER da provera jedinstvenosti vidi SVE aktivne
--     pozivnice (ne samo firme pozivaoca) → globalno jedinstven kod među pending.
--     Tvrda brana je partial-unique indeks (niže); generator samo bira slobodan kod.
-- ─────────────────────────────────────────────────────────────
create or replace function public.gen_invite_code()
  returns text
  language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';  -- bez O/0/I/1
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.invitations inv where inv.code = v_code and inv.status = 'pending'
    );
  end loop;
  return v_code;
end $$;
grant execute on function public.gen_invite_code() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- (B) Tabela pozivnica. invited_name / contact_hint su SAMO informativni (podsetnik
--     vlasniku ko je ko) — nisu ključ i ne utiču na pristup.
-- ─────────────────────────────────────────────────────────────
create table invitations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  role         text not null check (role in ('driver','dispatcher')),
  code         text not null default public.gen_invite_code(),
  invited_name text,                      -- informativno (ko je pozvan)
  contact_hint text,                      -- informativno (tel/imejl beleška vlasnika)
  created_by   uuid not null references app_users(id) on delete cascade,  -- vlasnik
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  status       text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  accepted_by  uuid references app_users(id) on delete set null,
  accepted_at  timestamptz
);
-- Jedinstvenost KODA samo među AKTIVNIM (pending): iskorišćen/otkazan kod se sme reciklirati.
create unique index invitations_active_code_uidx on invitations (code) where status = 'pending';
create index on invitations (company_id, status, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- (C) RLS
-- ─────────────────────────────────────────────────────────────
alter table invitations enable row level security;

-- Čitanje: vlasnik SVOJE firme; platform_admin (meta). Primalac NE čita tabelu.
create policy invitations_read on invitations for select using (
  (current_role_name() = 'owner' and company_id = current_company_id())
  or current_role_name() = 'platform_admin'
);
-- Upis: vlasnik SVOJE firme; created_by mora biti on sam.
create policy invitations_insert_owner on invitations for insert with check (
  current_role_name() = 'owner' and company_id = current_company_id() and created_by = auth.uid()
);
-- Otkaz/izmena: vlasnik SVOJE firme (app menja samo status='cancelled').
create policy invitations_update_owner on invitations for update using (
  current_role_name() = 'owner' and company_id = current_company_id()
) with check (
  current_role_name() = 'owner' and company_id = current_company_id()
);
-- Nema DELETE politike → pozivnice se ne brišu (istorija; otkaz = status).

-- RESTRICTIVE suspend-gate na upis (obustavljena firma ne pravi pozivnice).
create policy invitations_active_insert on invitations as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));

-- ─────────────────────────────────────────────────────────────
-- (D) accept_invitation — JEDINI put primaoca do pozivnice (RLS mu ne da select).
--     Vraća jsonb: { status: 'accepted'|'already_accepted', role, company_id }.
--     Greške nose kratak KOD u poruci (klijent mapira na lokalizovan tekst).
-- ─────────────────────────────────────────────────────────────
create or replace function public.accept_invitation(p_code text)
  returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  inv    invitations%rowtype;
  usr    app_users%rowtype;
  v_name text;
  v_has_user boolean;
begin
  if v_uid is null then
    raise exception 'INVITE_NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Traži AKTIVNU (pending) pozivnicu za taj kod (najviše jedna — partial-unique).
  select * into inv from invitations where code = v_code and status = 'pending' limit 1;

  if not found then
    -- Nema aktivne — pogledaj poslednju sa tim kodom radi jasne poruke.
    select * into inv from invitations where code = v_code order by created_at desc limit 1;
    if not found then
      raise exception 'INVITE_NOT_FOUND';
    elsif inv.status = 'accepted' and inv.accepted_by = v_uid then
      return jsonb_build_object('status', 'already_accepted', 'role', inv.role, 'company_id', inv.company_id);
    elsif inv.status = 'accepted' then
      raise exception 'INVITE_USED';
    elsif inv.status = 'cancelled' then
      raise exception 'INVITE_CANCELLED';
    else
      raise exception 'INVITE_EXPIRED';
    end if;
  end if;

  -- Istek (lenjo obeleži pa odbij).
  if inv.expires_at <= now() then
    update invitations set status = 'expired' where id = inv.id and status = 'pending';
    raise exception 'INVITE_EXPIRED';
  end if;

  -- Obustavljena firma ne prima nove članove (definer zaobilazi RLS → eksplicitno).
  if not company_is_active(inv.company_id) then
    raise exception 'INVITE_COMPANY_SUSPENDED' using errcode = '42501';
  end if;

  -- Pozivalac (može i da NE postoji kao app_users — svež nalog bez firme).
  select * into usr from app_users where id = v_uid;
  v_has_user := found;

  -- Uloge koje NE prihvataju pozivnice (vlasnik upravlja pozivnicama; admin je van firme).
  if v_has_user and usr.role in ('owner', 'platform_admin') then
    raise exception 'INVITE_ROLE_CANNOT_ACCEPT';
  end if;

  -- Već član DRUGE firme → prelazak firme je kasnija kriška (selidba), ne ovde.
  if v_has_user and usr.company_id is not null and usr.company_id <> inv.company_id then
    raise exception 'INVITE_OTHER_COMPANY';
  end if;

  v_name := coalesce(
    nullif(trim(inv.invited_name), ''),
    nullif(trim(usr.full_name), ''),
    (select email from auth.users where id = v_uid),
    'BT'
  );

  if inv.role = 'driver' then
    -- ── MOST: app_users (izvor pristupa) ──
    if not v_has_user then
      insert into app_users (id, company_id, role, full_name)
        values (v_uid, inv.company_id, 'driver', v_name);
    elsif usr.company_id is null then
      update app_users set company_id = inv.company_id where id = v_uid;
    end if;

    -- ── Trajni identitet: driver_profile (dobija BT-D broj kroz default) ──
    insert into driver_profiles (user_id, display_name)
      values (v_uid, v_name)
      on conflict (user_id) do nothing;

    -- ── drivers red u toj firmi — BEZ duplikata (lekcija blizanaca; drivers_user_id_uidx) ──
    if not exists (select 1 from drivers d where d.company_id = inv.company_id and d.user_id = v_uid) then
      insert into drivers (company_id, user_id, full_name) values (inv.company_id, v_uid, v_name);
    end if;

  else  -- inv.role = 'dispatcher'
    -- Dispečeru upisujemo SAMO identitet + zaposlenje; pristup/uloga stižu u K4.
    -- Zahteva postojeći app_users red (FK profila/zaposlenja) — svež nalog bez identiteta
    -- ne može još da postane dispečer (enum user_role nema 'dispatcher' do K4).
    if not v_has_user then
      raise exception 'INVITE_DISPATCHER_NOT_READY';
    end if;
    insert into dispatcher_profiles (user_id, display_name)
      values (v_uid, v_name)
      on conflict (user_id) do nothing;
  end if;

  -- ── AKTIVNO zaposlenje (osoba↔firma) — „tačno jedno aktivno" (employments_one_active_uidx) ──
  if not exists (
    select 1 from employments e
     where e.user_id = v_uid and e.company_id = inv.company_id and e.status = 'active'
  ) then
    insert into employments (company_id, user_id, role_on_company, status)
      values (inv.company_id, v_uid, inv.role, 'active');
  end if;

  -- ── Označi pozivnicu iskorišćenom ──
  update invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = inv.id;

  return jsonb_build_object('status', 'accepted', 'role', inv.role, 'company_id', inv.company_id);
end $$;
grant execute on function public.accept_invitation(text) to authenticated;
