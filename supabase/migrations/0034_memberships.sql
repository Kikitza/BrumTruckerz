-- ─────────────────────────────────────────────────────────────────────────────
-- 0034 — ČLANSTVA (memberships) — temelj (v2-3 kriška 1). ADR 0013 (PRIHVAĆENO).
--
-- memberships(user × firma × rola) = jedini izvor TEKUĆE autorizacije. app_users
-- ostaje bootstrap identiteta + pokazivač aktivne firme (active_company_id).
-- employments ostaje istorija/CV. RLS „mozak" se menja SAMO u telima helpera
-- (nijedna politika se ne prepisuje); helperi čitaju AKTIVNO članstvo, uz FALLBACK
-- na stare app_users kolone (prelazni period + kompatibilnost postojećih testova).
--
-- Backfill je PARITETAN: svaki app_users red → jedno aktivno članstvo = današnje stanje.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_users(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  role        user_role not null,
  status      text not null default 'active' check (status in ('active','ended')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  constraint memberships_status_ended_ck
    check ((status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null))
);
-- Jedno AKTIVNO članstvo po (osoba, firma).
create unique index if not exists memberships_one_active_per_company_uidx
  on public.memberships (user_id, company_id) where status = 'active';
-- V1 PRAVILO (ADR 0013): najviše JEDNO aktivno VOZAČKO članstvo po osobi.
create unique index if not exists memberships_one_active_driver_uidx
  on public.memberships (user_id) where role = 'driver' and status = 'active';
create index if not exists memberships_company_idx on public.memberships (company_id, status);

-- Pokazivač aktivne firme (default = današnja firma; backfill ispod).
alter table public.app_users add column if not exists active_company_id uuid references companies(id) on delete set null;

-- ── BACKFILL (paritet sa današnjim stanjem) ──
update public.app_users set active_company_id = company_id
  where active_company_id is null and company_id is not null;
insert into public.memberships (user_id, company_id, role, status)
  select id, company_id, role, 'active' from public.app_users
   where company_id is not null
  on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- RLS: korisnik vidi SVOJA članstva; office vidi članstva svoje (aktivne) firme.
-- Upis ISKLJUČIVO kroz SECURITY DEFINER RPC-ove (accept_invitation, set_active_company).
-- ─────────────────────────────────────────────────────────────
alter table public.memberships enable row level security;
drop policy if exists memberships_self on public.memberships;
create policy memberships_self on public.memberships for select using (user_id = auth.uid());
drop policy if exists memberships_office on public.memberships;
create policy memberships_office on public.memberships for select using (
  public.is_office_role() and company_id = public.current_company_id()
);

-- ─────────────────────────────────────────────────────────────
-- RLS „MOZAK": helperi čitaju AKTIVNO članstvo (preko active_company_id), fallback na
-- stare kolone ako članstva/pokazivača nema. ISTE signature → politike se NE diraju.
-- ─────────────────────────────────────────────────────────────
create or replace function public.current_company_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.active_company_id from app_users u
      where u.id = auth.uid() and u.active_company_id is not null
        and exists (select 1 from memberships m
                     where m.user_id = u.id and m.company_id = u.active_company_id and m.status = 'active')),
    (select company_id from app_users where id = auth.uid())
  )
$$;

create or replace function public.current_role_name() returns user_role
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.role from memberships m
       join app_users u on u.id = m.user_id
      where m.user_id = auth.uid() and m.company_id = u.active_company_id and m.status = 'active'
      limit 1),
    (select role from app_users where id = auth.uid())
  )
$$;

-- is_office_role sada preko current_role_name (koji čita aktivno članstvo).
create or replace function public.is_office_role() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name()::text in ('owner','dispatcher'), false)
$$;

-- ─────────────────────────────────────────────────────────────
-- set_active_company: prekidač aktivne firme. Validira aktivno članstvo → postavi
-- pokazivač + sinhronizuj stare kolone (fallback). Bez članstva → jasna greška.
-- ─────────────────────────────────────────────────────────────
create or replace function public.set_active_company(p_company uuid)
  returns void
  language plpgsql volatile security definer set search_path = public as $$
declare v_role user_role;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select role into v_role from memberships
   where user_id = auth.uid() and company_id = p_company and status = 'active' limit 1;
  if not found then raise exception 'NO_ACTIVE_MEMBERSHIP' using errcode = '42501'; end if;
  update app_users set active_company_id = p_company, company_id = p_company, role = v_role
   where id = auth.uid();
end $$;
grant execute on function public.set_active_company(uuid) to authenticated;

-- Lista mojih aktivnih članstava (za prekidač) — definer da zaobiđe companies RLS
-- (korisnik ne sme direktno da čita tuđe companies redove, ali sme imena SVOJIH firmi).
create or replace function public.my_memberships()
  returns table (company_id uuid, company_name text, role user_role, is_active boolean)
  language sql stable security definer set search_path = public as $$
  select m.company_id, c.name, m.role, (m.company_id = u.active_company_id)
    from memberships m
    join companies c on c.id = m.company_id
    join app_users u on u.id = m.user_id
   where m.user_id = auth.uid() and m.status = 'active'
   order by c.name;
$$;
grant execute on function public.my_memberships() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- accept_invitation DOPUNA: prihvatanje sada kreira ČLANSTVO (+ sinhronizuje stare
-- kolone i active_company_id za fallback). V1 pravilo: vozačka pozivnica dok osoba
-- već ima drugo aktivno vozačko članstvo → odbij. Office (dispatcher) u drugu firmu SME.
-- (Nasleđe 0020 + memberships; uklonjen tvrdi INVITE_OTHER_COMPANY blok za multi-firmu.)
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

  select * into inv from invitations where code = v_code and status = 'pending' limit 1;
  if not found then
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

  if inv.expires_at <= now() then
    update invitations set status = 'expired' where id = inv.id and status = 'pending';
    raise exception 'INVITE_EXPIRED';
  end if;

  if not company_is_active(inv.company_id) then
    raise exception 'INVITE_COMPANY_SUSPENDED' using errcode = '42501';
  end if;

  select * into usr from app_users where id = v_uid;
  v_has_user := found;

  if v_has_user and usr.role in ('owner', 'platform_admin') then
    raise exception 'INVITE_ROLE_CANNOT_ACCEPT';
  end if;

  -- V1 PRAVILO (ADR 0013): najviše JEDNO aktivno VOZAČKO članstvo po osobi.
  -- Office (dispatcher) pozivnica u DRUGU firmu je dozvoljena (multi-firma) — nema blokade.
  if inv.role = 'driver' and exists (
    select 1 from memberships m
     where m.user_id = v_uid and m.role = 'driver' and m.status = 'active'
       and m.company_id <> inv.company_id
  ) then
    raise exception 'INVITE_DRIVER_ALREADY_ENGAGED' using errcode = '42501';
  end if;

  v_name := coalesce(
    nullif(trim(inv.invited_name), ''),
    nullif(trim(usr.full_name), ''),
    nullif(trim((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid)), ''),
    'Vozač'
  );

  -- MOST: app_users (izvor pristupa). Nov nalog → upiši; postojeći bez firme → poveži.
  if not v_has_user then
    insert into app_users (id, company_id, role, full_name)
      values (v_uid, inv.company_id, inv.role::user_role, v_name);
  elsif usr.company_id is null then
    update app_users set company_id = inv.company_id, role = inv.role::user_role where id = v_uid;
  end if;

  if inv.role = 'driver' then
    insert into driver_profiles (user_id, display_name)
      values (v_uid, v_name) on conflict (user_id) do nothing;
    -- drivers: JEDAN red po osobi (globalno jedinstven, 0007). Postoji → prebaci na firmu; inače insert.
    if exists (select 1 from drivers where user_id = v_uid) then
      update drivers set company_id = inv.company_id where user_id = v_uid;
    else
      insert into drivers (company_id, user_id, full_name) values (inv.company_id, v_uid, v_name);
    end if;
  else
    insert into dispatcher_profiles (user_id, display_name)
      values (v_uid, v_name) on conflict (user_id) do nothing;
  end if;

  -- Aktivno zaposlenje (istorija/CV) — „tačno jedno aktivno" po firmi.
  if not exists (
    select 1 from employments e
     where e.user_id = v_uid and e.company_id = inv.company_id and e.status = 'active'
  ) then
    insert into employments (company_id, user_id, role_on_company, status)
      values (inv.company_id, v_uid, inv.role, 'active');
  end if;

  -- ČLANSTVO (tekuća autorizacija) — idempotentno; + pokazivač aktivne firme (postavi ako ga nema).
  if not exists (
    select 1 from memberships m
     where m.user_id = v_uid and m.company_id = inv.company_id and m.status = 'active'
  ) then
    insert into memberships (user_id, company_id, role, status)
      values (v_uid, inv.company_id, inv.role::user_role, 'active');
  end if;
  update app_users set active_company_id = coalesce(active_company_id, inv.company_id) where id = v_uid;

  update invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = inv.id;

  return jsonb_build_object('status', 'accepted', 'role', inv.role, 'company_id', inv.company_id);
end $$;
grant execute on function public.accept_invitation(text) to authenticated;
