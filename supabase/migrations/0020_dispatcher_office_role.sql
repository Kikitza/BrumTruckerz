-- ─────────────────────────────────────────────────────────────────────────────
-- 0020 — DISPEČER (uloga + prava po potpisanoj matrici ADR 0003).
--
-- Matrica: dispečer sme SVE kao vlasnik (ture/stanice/dodele, finansije/P&L, troškovi,
-- rokovi/flota, dokumenti, dnevnik, i UPRAVLJANJE NALOZIMA VOZAČA — vozačke pozivnice +
-- driver-account edge) — OSIM: dispečerskih naloga/pozivnica, paketa i podešavanja firme.
--
--   (A) enum user_role + 'dispatcher' (ADD VALUE — NE koristi se u istoj transakciji,
--       obrazac iz 0011; sva upotreba je kroz role::text ili runtime cast);
--   (B) is_office_role() = owner ILI dispatcher (security definer, stable);
--   (C) SISTEMSKO proširenje politika: operativa/finansije/flota/rokovi/dokumenti/dnevnik/
--       identitet-čitanje: owner-uslov → is_office_role(). OSTAJE owner-only: companies (nema
--       ni owner write — samo admin RPC), employments insert/update, dispatcher_profiles čitanje
--       firme, i dispečerske pozivnice; invitations za role='driver' → office;
--   (D) accept_invitation: dispečerska grana KOMPLETNA (app_users role 'dispatcher' + profil +
--       zaposlenje); ukinut INVITE_DISPATCHER_NOT_READY.
--
-- BEZBEDNOST ENUMA: nigde se 'dispatcher'::user_role literal ne koristi u DDL-u ove migracije
-- (is_office_role poredi role::text; accept_invitation koristi inv.role::user_role runtime).
-- ─────────────────────────────────────────────────────────────────────────────

-- (A) Nova uloga. ADD VALUE se NE koristi u istoj transakciji (obrazac 0011).
alter type user_role add value if not exists 'dispatcher';

-- (B) Kancelarijska uloga: owner ILI dispatcher. role::text → bez enum-literala (bezbedno
--     i pre commita nove vrednosti). security definer (vozač nema select na app_users tuđe).
create or replace function public.is_office_role() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role::text in ('owner','dispatcher') from app_users where id = auth.uid()), false)
$$;
grant execute on function public.is_office_role() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- (C) POLITIKE: owner-uslov → is_office_role() (operativa/finansije/flota/rokovi/dokumenti).
--     Admin grana i suspend-gate (RESTRICTIVE, 0015) ostaju netaknuti.
-- ─────────────────────────────────────────────────────────────

-- TURE (bazna + finansije; trip_pnl/driver_performance nasleđuju kroz security_invoker)
drop policy trips_owner on trips;
create policy trips_owner on trips for all
  using  (company_id = current_company_id() and is_office_role())
  with check (company_id = current_company_id() and is_office_role());

-- TROŠKOVI
drop policy expenses_owner on expenses;
create policy expenses_owner on expenses for all
  using  (company_id = current_company_id() and is_office_role())
  with check (company_id = current_company_id() and is_office_role());

-- PRILOZI (metapodatak)
drop policy attach_owner on attachments;
create policy attach_owner on attachments for all
  using  (company_id = current_company_id() and is_office_role())
  with check (company_id = current_company_id() and is_office_role());

-- DNEVNIK (append-only: samo select + insert; correct_trip_event RPC dole)
drop policy events_select_owner on trip_events;
create policy events_select_owner on trip_events for select
  using (company_id = current_company_id() and is_office_role());
drop policy events_insert_owner on trip_events;
create policy events_insert_owner on trip_events for insert
  with check (company_id = current_company_id() and is_office_role());

-- STANICE (nema company_id kolonu → preko trips)
drop policy trip_stops_owner on trip_stops;
create policy trip_stops_owner on trip_stops for all
  using (current_role_name() = 'platform_admin' or (is_office_role()
         and exists (select 1 from trips t where t.id = trip_stops.trip_id and t.company_id = current_company_id())))
  with check (current_role_name() = 'platform_admin' or (is_office_role()
         and exists (select 1 from trips t where t.id = trip_stops.trip_id and t.company_id = current_company_id())));

-- FLOTA (vozila/prikolice/vozači) + ROKOVI — zadrži admin granu
drop policy vehicles_tenant on vehicles;
create policy vehicles_tenant on vehicles for all
  using  (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()))
  with check (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()));

drop policy trailers_tenant on trailers;
create policy trailers_tenant on trailers for all
  using  (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()))
  with check (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()));

drop policy drivers_tenant on drivers;
create policy drivers_tenant on drivers for all
  using  (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()))
  with check (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()));

drop policy reminders_tenant on reminders;
create policy reminders_tenant on reminders for all
  using  (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()))
  with check (current_role_name() = 'platform_admin' or (company_id = current_company_id() and is_office_role()));

-- PERFORMANS rollup (P&L/performans dispečeru)
drop policy rollup_tenant on driver_month_rollup;
create policy rollup_tenant on driver_month_rollup for select
  using (company_id = current_company_id() and is_office_role());

-- KORISNICI firme (dispečer vidi naloge firme — upravljanje vozačima)
drop policy users_read on app_users;
create policy users_read on app_users for select using (
  id = auth.uid()
  or (is_office_role() and company_id = current_company_id())
  or current_role_name() = 'platform_admin'
);

-- PROFILI VOZAČA (dispečer upravlja vozačima → vidi njihove profile).
-- dispatcher_profiles OSTAJE owner-only (dispečerski nalozi = vlasnikov domen); dispečer
-- svoj profil ionako vidi kroz user_id=auth.uid() granu.
drop policy driver_profiles_read on driver_profiles;
create policy driver_profiles_read on driver_profiles for select using (
  user_id = auth.uid()
  or (is_office_role() and profile_company_id(user_id) = current_company_id())
  or current_role_name() = 'platform_admin'
);

-- ZAPOSLENJA — čitanje: office (vidi članstva firme). Upis/izmena OSTAJU owner-only
-- (app ih ne zove direktno; sprečava da dispečer fabrikuje dispečerska zaposlenja).
drop policy employments_read on employments;
create policy employments_read on employments for select using (
  user_id = auth.uid()
  or (is_office_role() and company_id = current_company_id())
  or current_role_name() = 'platform_admin'
);

-- STORAGE (prilozi): owner-pristup fajlovima firme → office. Vozačke politike netaknute.
-- `if exists`: na okruženju gde restore NIJE nosio `storage` šemu (npr. staging), politike iz
-- 0008 ne postoje pa bi goli drop pukao — kreiranje niže svejedno postavlja office verzije.
drop policy if exists prilozi_owner_read on storage.objects;
create policy prilozi_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'prilozi' and public.is_office_role()
         and (storage.foldername(name))[1] = public.current_company_id()::text);
drop policy if exists prilozi_owner_write on storage.objects;
create policy prilozi_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'prilozi' and public.is_office_role()
         and (storage.foldername(name))[1] = public.current_company_id()::text);

-- ─────────────────────────────────────────────────────────────
-- POZIVNICE: dispečer vidi/pravi/otkazuje SAMO vozačke (role='driver'); vlasnik sve.
-- Vozač i dalje NE čita tabelu (is_office_role() je false za vozača).
-- ─────────────────────────────────────────────────────────────
drop policy invitations_read on invitations;
create policy invitations_read on invitations for select using (
  (company_id = current_company_id() and is_office_role()
   and (current_role_name() = 'owner' or role = 'driver'))
  or current_role_name() = 'platform_admin'
);
drop policy invitations_insert_owner on invitations;
create policy invitations_insert_office on invitations for insert with check (
  company_id = current_company_id() and created_by = auth.uid() and is_office_role()
  and (current_role_name() = 'owner' or role = 'driver')
);
drop policy invitations_update_owner on invitations;
create policy invitations_update_office on invitations for update using (
  company_id = current_company_id() and is_office_role()
  and (current_role_name() = 'owner' or role = 'driver')
) with check (
  company_id = current_company_id() and is_office_role()
  and (current_role_name() = 'owner' or role = 'driver')
);

-- ─────────────────────────────────────────────────────────────
-- (D) accept_invitation: dispečerska grana KOMPLETNA (app_users role 'dispatcher' + profil +
--     zaposlenje). role u app_users se piše kroz inv.role::user_role (runtime cast — bezbedno
--     za enum). Ostatak = 0019.
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

  if v_has_user and usr.company_id is not null and usr.company_id <> inv.company_id then
    raise exception 'INVITE_OTHER_COMPANY';
  end if;

  -- Ime za profil/nalog: pozivnica (invited_name) → full_name naloga → ime iz REGISTRACIJE
  -- (auth metadata full_name, dispečerska prijava email+ime) → 'Vozač'.
  v_name := coalesce(
    nullif(trim(inv.invited_name), ''),
    nullif(trim(usr.full_name), ''),
    nullif(trim((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid)), ''),
    'Vozač'
  );

  -- ── MOST: app_users (izvor pristupa) — role iz pozivnice (driver|dispatcher) ──
  if not v_has_user then
    insert into app_users (id, company_id, role, full_name)
      values (v_uid, inv.company_id, inv.role::user_role, v_name);
  elsif usr.company_id is null then
    update app_users set company_id = inv.company_id where id = v_uid;
  end if;

  if inv.role = 'driver' then
    -- Trajni identitet + drivers red (bez duplikata; lekcija blizanaca).
    insert into driver_profiles (user_id, display_name)
      values (v_uid, v_name) on conflict (user_id) do nothing;
    if not exists (select 1 from drivers d where d.company_id = inv.company_id and d.user_id = v_uid) then
      insert into drivers (company_id, user_id, full_name) values (inv.company_id, v_uid, v_name);
    end if;
  else  -- 'dispatcher'
    -- Dispečerski profil (public_no ostaje null „po potrebi" — ADR 0001).
    insert into dispatcher_profiles (user_id, display_name)
      values (v_uid, v_name) on conflict (user_id) do nothing;
  end if;

  -- Aktivno zaposlenje (osoba↔firma) — „tačno jedno aktivno".
  if not exists (
    select 1 from employments e
     where e.user_id = v_uid and e.company_id = inv.company_id and e.status = 'active'
  ) then
    insert into employments (company_id, user_id, role_on_company, status)
      values (inv.company_id, v_uid, inv.role, 'active');
  end if;

  update invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = inv.id;

  return jsonb_build_object('status', 'accepted', 'role', inv.role, 'company_id', inv.company_id);
end $$;
grant execute on function public.accept_invitation(text) to authenticated;
