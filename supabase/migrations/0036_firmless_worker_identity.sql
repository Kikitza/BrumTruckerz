-- ─────────────────────────────────────────────────────────────────────────────
-- 0036 — RADNIK BEZ FIRME: identitet + javni broj (v2-3 kriška 2b). ADR 0013 (dopuna 22.8).
--
-- Doktrina (dopuna 0013): identitet SME postojati bez ijednog članstva. `app_users` je
-- ČIST IDENTITET (1 red po auth nalogu); `company_id`/`role` su LEGACY fallback i sada su
-- NULLABLE za ne-admina. Rola izvire iz ČLANSTVA (memberships), ne iz identiteta.
-- „Radnik bez firme" = identitet sa nula aktivnih članstava.
--
-- Sve ispod je ADITIVNO/omekšavajuće — postojeći podaci netaknuti (svi današnji redovi
-- imaju company_id → zadovoljavaju i stari i novi constraint).
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) OMEKŠAJ CONSTRAINT: dozvoli čist identitet bez firme (role NULL + company_id NULL).
--     Invarijanta ostaje: ne-admin ili ima firmu, ili je potpuno prazan identitet;
--     nikad „rola bez firme" ni „firma bez role".
alter table app_users alter column role drop not null;
alter table app_users drop constraint if exists app_users_company_by_role;
alter table app_users
  add constraint app_users_company_by_role
  check (
    role = 'platform_admin'                          -- admin: firma sme biti null
    or company_id is not null                        -- ne-admin sa firmom (današnje stanje)
    or (role is null and company_id is null)         -- NOVO: čist identitet bez firme
  );

-- (2) ensure_identity(): bootstrap čistog identiteta za auth.uid() bez app_users reda.
--     Idempotentno (on conflict do nothing). Ime se povlači iz auth metapodataka ako postoji.
--
--     ZAŠTO RPC A NE TRIGER na auth.users: `auth` šemom upravlja Supabase (Auth servis);
--     triger na auth.users je krhak kroz platformske nadogradnje i vezuje naš bootstrap za
--     interne detalje Auth-a. RPC drži identitetski bootstrap u NAŠOJ šemi (kontrolisano,
--     verzionisano, pod RLS-om), a klijent ga zove na prvom ulasku (posle prijave). Poziv je
--     jeftin i idempotentan → nema potrebe za trigerom.
create or replace function public.ensure_identity()
  returns void language plpgsql volatile security definer set search_path = public as $$
begin
  insert into app_users (id, company_id, role, full_name)
    select auth.uid(), null, null,
           nullif(trim((select raw_user_meta_data->>'full_name' from auth.users where id = auth.uid())), '')
  on conflict (id) do nothing;
end $$;
grant execute on function public.ensure_identity() to authenticated;

-- (3) ensure_worker_public_no(role): pri deklarisanju tražene role dodeli TRAJNI javni broj
--     radniku BEZ firme (profil identiteta, ne firme). Vozač → BT-D (auto sekvenca). Dispečer
--     → profil se osigura, ali broj ostaje „po potrebi" (ADR 0001: dispečerski broj nije
--     auto-generisan; ne uvodimo novu šemu bez ADR-a). Vraća dodeljeni broj (ili NULL).
--     Definer: driver_profiles/dispatcher_profiles nemaju INSERT politiku za obične uloge.
create or replace function public.ensure_worker_public_no(p_role text)
  returns text language plpgsql volatile security definer set search_path = public as $$
declare v_no text;
begin
  if p_role not in ('driver', 'dispatcher') then raise exception 'BAD_ROLE' using errcode = '22023'; end if;
  -- Identitet mora postojati (FK profila → app_users). Osiguraj ga (idempotentno).
  insert into app_users (id, company_id, role, full_name)
    values (auth.uid(), null, null, null) on conflict (id) do nothing;

  if p_role = 'driver' then
    insert into driver_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    select public_no into v_no from driver_profiles where user_id = auth.uid();
  else
    insert into dispatcher_profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    select public_no into v_no from dispatcher_profiles where user_id = auth.uid();  -- „po potrebi" → može NULL
  end if;
  return v_no;
end $$;
grant execute on function public.ensure_worker_public_no(text) to authenticated;

-- (4) my_worker_public_no(): radnik čita svoj dodeljeni javni broj (za prikaz u domu).
--     RLS na profilima ionako dozvoljava self (user_id=auth.uid()); definer radi zbir bez
--     zavisnosti od trenutne role/firme.
create or replace function public.my_worker_public_no()
  returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select public_no from driver_profiles     where user_id = auth.uid()),
    (select public_no from dispatcher_profiles where user_id = auth.uid())
  )
$$;
grant execute on function public.my_worker_public_no() to authenticated;
