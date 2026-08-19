-- ─────────────────────────────────────────────────────────────────────────────
-- RLS test svita (audit B8, tačka 8). Mehanizam: impersonacija kroz
-- set_config('request.jwt.claims', …) + `set local role authenticated`, sve u
-- JEDNOJ transakciji koja se na kraju ROLLBACK-uje (namerni `raise` sentinel),
-- pa je test STROGO READ-ONLY nad DEV bazom (fixtures ne ostaju).
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/rls_audit_test.sql
--   uspeh  => izlaz sadrži 'ALL_RLS_TESTS_PASSED'
--   pad    => izlaz sadrži 'FAIL: …' (prvi pali uslov)
--
-- Pokriva: (a) owner UPDATE/DELETE trip_events => append-only (0 redova);
--          (b) platform_admin SELECT tuđih trip_events => 0;
--          (c) firma A ≠ firma B (trips/trip_events/companies);
--          (d) obustavljena firma: SELECT prolazi, INSERT blokiran;
--          (+) pozitivna kontrola: aktivna firma INSERT prolazi.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_s uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_da uuid := gen_random_uuid();
  u_ob uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid(); u_os uuid := gen_random_uuid();
  d_a uuid := gen_random_uuid(); v_a uuid := gen_random_uuid();
  t_a uuid := gen_random_uuid(); e_a uuid := gen_random_uuid();
  n int; st text; ok boolean;
begin
  -- ═══ FIXTURES (kao postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_da,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_da||'@t.local'),
    (u_ob,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_admin, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_admin||'@t.local'),
    (u_os,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_os||'@t.local');
  insert into companies (id, name, status) values
    (c_a,'A','active'), (c_b,'B','active'), (c_s,'S','suspended');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a, 'owner'), (u_da, c_a, 'driver'),
    (u_ob, c_b, 'owner'), (u_admin, null, 'platform_admin'), (u_os, c_s, 'owner');
  insert into drivers  (id, company_id, user_id, full_name) values (d_a, c_a, u_da, 'Drv A');
  insert into vehicles (id, company_id, registration)       values (v_a, c_a, 'REG-A');
  insert into trips    (id, company_id, driver_id, vehicle_id, status) values (t_a, c_a, d_a, v_a, 'driving');
  insert into trip_events (id, company_id, trip_id, type)    values (e_a, c_a, t_a, 'load');

  -- ═══ (a) OWNER na append-only trip_events: UPDATE/DELETE => 0 redova ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  set local role authenticated;

  update trip_events set note = 'hack' where id = e_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: owner UPDATE trip_events zahvatio % redova (append-only mora 0)', n; end if;

  delete from trip_events where id = e_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: owner DELETE trip_events zahvatio % redova (append-only mora 0)', n; end if;

  select count(*) into n from trip_events where trip_id = t_a;
  if n <> 1 then raise exception 'FAIL: ownerA ne vidi svoj event (video %, očekivano 1)', n; end if;
  select count(*) into n from trips;
  if n <> 1 then raise exception 'FAIL: ownerA vidi % tura (očekivano 1)', n; end if;

  -- ═══ (b) PLATFORM_ADMIN: 0 poslovnog sadržaja firmi ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin)::text, true);
  select count(*) into n from trip_events;
  if n <> 0 then raise exception 'FAIL: platform_admin vidi % trip_events (mora 0)', n; end if;
  select count(*) into n from trips;
  if n <> 0 then raise exception 'FAIL: platform_admin vidi % trips (mora 0)', n; end if;

  -- ═══ (c) IZOLACIJA firmi: B ne vidi A ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from trips;
  if n <> 0 then raise exception 'FAIL: ownerB vidi % tura firme A (mora 0)', n; end if;
  select count(*) into n from trip_events;
  if n <> 0 then raise exception 'FAIL: ownerB vidi % events firme A (mora 0)', n; end if;
  select count(*) into n from companies;
  if n <> 1 then raise exception 'FAIL: ownerB vidi % firmi (mora 1 — samo svoju)', n; end if;

  -- ═══ (d) OBUSTAVA: SELECT prolazi, INSERT blokiran ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_os)::text, true);
  select status into st from companies where id = c_s;
  if st is distinct from 'suspended' then raise exception 'FAIL: ownerS ne čita status svoje firme (dobio %)', st; end if;

  ok := false;
  begin
    insert into vehicles (company_id, registration) values (c_s, 'SUSP-X');
  exception when others then ok := true;  -- očekivano: restrictive active-gate blokira upis
  end;
  if not ok then raise exception 'FAIL: INSERT u OBUSTAVLJENU firmu NIJE blokiran'; end if;

  -- ═══ (+) POZITIVNA KONTROLA: aktivna firma A — INSERT prolazi ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  insert into vehicles (company_id, registration) values (c_a, 'ACT-OK'); -- bez izuzetka = prošlo

  -- Sve prošlo → namerni rollback (read-only).
  raise exception 'ALL_RLS_TESTS_PASSED';
end $$;
