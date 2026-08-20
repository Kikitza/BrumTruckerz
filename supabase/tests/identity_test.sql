-- ─────────────────────────────────────────────────────────────────────────────
-- IDENTITET test svita (0017: driver_profiles / employments). Isti mehanizam kao
-- rls_audit_test: impersonacija (jwt claims + set local role authenticated) u JEDNOJ
-- transakciji koja se na kraju ROLLBACK-uje (namerni `raise` sentinel) → READ-ONLY.
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/identity_test.sql
--   uspeh => izlaz sadrži 'ALL_IDENTITY_TESTS_PASSED'
--   pad   => 'FAIL: …'
--
-- Pokriva: (a) jedinstvenost javnih brojeva (unique public_no) + monoton generator;
--          (b) vozač vidi SVOJ profil i SVOJE zaposlenje (i ništa tuđe);
--          (c) izolacija firmi (owner B ne vidi zaposlenja/profile firme A);
--          (d) owner A vidi profil+zaposlenje svog vozača; platform_admin vidi meta;
--          (e) suspend-gate: upis zaposlenja u obustavljenu firmu blokiran.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_s uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_da uuid := gen_random_uuid();
  u_ob uuid := gen_random_uuid(); u_db uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid(); u_os uuid := gen_random_uuid();
  d_a uuid := gen_random_uuid(); d_b uuid := gen_random_uuid();
  no_a text; no_b text; n int; ok boolean;
begin
  -- ═══ FIXTURES (kao postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_da,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_da||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_db,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_db||'@t.local'),
    (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_admin||'@t.local'),
    (u_os,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_os||'@t.local');
  insert into companies (id, name, status) values
    (c_a,'A','active'), (c_b,'B','active'), (c_s,'S','suspended');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a,'owner'), (u_da, c_a,'driver'),
    (u_ob, c_b,'owner'), (u_db, c_b,'driver'),
    (u_admin, null,'platform_admin'), (u_os, c_s,'owner');
  insert into drivers (id, company_id, user_id, full_name) values
    (d_a, c_a, u_da, 'Drv A'), (d_b, c_b, u_db, 'Drv B');

  -- profili (auto public_no) + aktivna zaposlenja
  insert into driver_profiles (user_id, display_name) values (u_da,'Drv A'), (u_db,'Drv B');
  insert into employments (company_id, user_id, role_on_company) values
    (c_a, u_da, 'driver'), (c_b, u_db, 'driver');

  select public_no into no_a from driver_profiles where user_id = u_da;
  select public_no into no_b from driver_profiles where user_id = u_db;

  -- ═══ (a) JEDINSTVENOST + MONOTON generator ═══
  if no_a is null or no_b is null then raise exception 'FAIL: profil bez javnog broja'; end if;
  if no_a = no_b then raise exception 'FAIL: dva vozača dobila isti javni broj (% = %)', no_a, no_b; end if;
  if no_a !~ '^BT-D-\d{5,}$' then raise exception 'FAIL: javni broj pogrešan format (%)', no_a; end if;

  ok := false;
  begin
    insert into driver_profiles (user_id, public_no) values (u_oa, no_a);  -- duplikat broja
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: duplikat public_no NIJE odbijen'; end if;

  -- ═══ (b) VOZAČ A: vidi SVOJ profil i SVOJE zaposlenje, i ništa tuđe ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_da)::text, true);
  set local role authenticated;

  select count(*) into n from driver_profiles;
  if n <> 1 then raise exception 'FAIL: vozač A vidi % profila (mora 1 — svoj)', n; end if;
  select count(*) into n from driver_profiles where user_id = u_da;
  if n <> 1 then raise exception 'FAIL: vozač A ne vidi svoj profil'; end if;

  select count(*) into n from employments;
  if n <> 1 then raise exception 'FAIL: vozač A vidi % zaposlenja (mora 1 — svoje)', n; end if;
  select count(*) into n from employments where user_id = u_da and company_id = c_a and status = 'active';
  if n <> 1 then raise exception 'FAIL: vozač A ne vidi svoje aktivno zaposlenje'; end if;

  -- ═══ (c) IZOLACIJA: owner B ne vidi A ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from employments;
  if n <> 1 then raise exception 'FAIL: owner B vidi % zaposlenja (mora 1 — samo B)', n; end if;
  select count(*) into n from employments where company_id = c_a;
  if n <> 0 then raise exception 'FAIL: owner B vidi zaposlenja firme A (%)', n; end if;
  select count(*) into n from driver_profiles;
  if n <> 1 then raise exception 'FAIL: owner B vidi % profila (mora 1 — svog vozača)', n; end if;

  -- ═══ (d) OWNER A vidi svog vozača; PLATFORM_ADMIN vidi meta ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select count(*) into n from driver_profiles where user_id = u_da;
  if n <> 1 then raise exception 'FAIL: owner A ne vidi profil svog vozača'; end if;
  select count(*) into n from employments where company_id = c_a;
  if n <> 1 then raise exception 'FAIL: owner A ne vidi zaposlenje svoje firme'; end if;

  -- (skujemo na fixture redove: DEV može imati realne backfill-ovane profile/zaposlenja)
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin)::text, true);
  select count(*) into n from driver_profiles where user_id in (u_da, u_db);
  if n <> 2 then raise exception 'FAIL: platform_admin ne vidi oba fixture profila (%, mora 2)', n; end if;
  select count(*) into n from employments where user_id in (u_da, u_db);
  if n <> 2 then raise exception 'FAIL: platform_admin ne vidi oba fixture zaposlenja (%, mora 2)', n; end if;

  -- ═══ (e) SUSPEND-GATE: upis zaposlenja u obustavljenu firmu blokiran ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_os)::text, true);
  ok := false;
  begin
    insert into employments (company_id, user_id, role_on_company) values (c_s, u_os, 'driver');
  exception when others then ok := true;  -- očekivano: restrictive suspend-gate
  end;
  if not ok then raise exception 'FAIL: upis zaposlenja u OBUSTAVLJENU firmu NIJE blokiran'; end if;

  -- Sve prošlo → namerni rollback (read-only).
  raise exception 'ALL_IDENTITY_TESTS_PASSED';
end $$;
