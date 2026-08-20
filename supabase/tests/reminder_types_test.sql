-- ─────────────────────────────────────────────────────────────────────────────
-- ŠIFARNIK ROKOVA + KM test svita (0024). Impersonacija, ROLLBACK (sentinel).
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/reminder_types_test.sql
--   uspeh => 'ALL_REMINDER_TYPES_TESTS_PASSED'; pad => 'FAIL: …'
--
-- Pokriva: reminder_types čitljiv SVIMA (vozač/owner/admin); klijentski WRITE odbijen;
--   reminders (type_id/mode/km kolone) kroz postojeću izolaciju office; vozač 0.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid(); u_drv uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  d_a uuid := gen_random_uuid(); v_a uuid := gen_random_uuid();
  ty uuid; n int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_drv,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_drv||'@t.local'),
    (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_admin||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active');
  insert into app_users (id, company_id, role) values
    (u_oa,c_a,'owner'), (u_ob,c_b,'owner'), (u_drv,c_a,'driver'), (u_admin,null,'platform_admin');
  insert into drivers (id, company_id, user_id, full_name) values (d_a, c_a, u_drv, 'Drv A');
  insert into vehicles (id, company_id, registration, current_odometer) values (v_a, c_a, 'A-1', 9600);
  select id into ty from reminder_types where code = 'registration' and subject_kind = 'vehicle';

  set local role authenticated;

  -- ═══ ŠIFARNIK čitljiv SVIMA (seed = 12) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_drv)::text, true);
  select count(*) into n from reminder_types;
  if n <> 12 then raise exception 'FAIL: vozač ne vidi šifarnik (%, očekivano 12)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin)::text, true);
  select count(*) into n from reminder_types;
  if n <> 12 then raise exception 'FAIL: admin ne vidi šifarnik (%)', n; end if;

  -- ═══ KLIJENTSKI WRITE odbijen (nema write politike) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  ok := false;
  begin
    insert into reminder_types (code, subject_kind, name_key) values ('hack','vehicle','x');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: klijent upisao u šifarnik (write nije odbijen)'; end if;

  -- ═══ reminders type/km kolone kroz izolaciju: owner A upisuje km-rok ═══
  insert into reminders (company_id, subject_type, subject_id, category, kind, type_id, mode, due_km)
    values (c_a, 'vehicle', v_a, 'registration', 'date', ty, 'km', 12000);
  select count(*) into n from reminders where mode = 'km' and subject_id = v_a and type_id = ty;
  if n <> 1 then raise exception 'FAIL: km-rok sa type_id nije upisan'; end if;

  -- owner B ne vidi
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from reminders where subject_id = v_a;
  if n <> 0 then raise exception 'FAIL: owner B vidi rok firme A (%)', n; end if;

  -- vozač ne vidi rokove (reminders je office-only)
  perform set_config('request.jwt.claims', json_build_object('sub', u_drv)::text, true);
  select count(*) into n from reminders where subject_id = v_a;
  if n <> 0 then raise exception 'FAIL: vozač vidi rokove (%)', n; end if;

  raise exception 'ALL_REMINDER_TYPES_TESTS_PASSED';
end $$;
