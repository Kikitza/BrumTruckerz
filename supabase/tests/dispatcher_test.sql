-- ─────────────────────────────────────────────────────────────────────────────
-- DISPEČER test svita (0020: is_office_role + matrica ADR 0003). Isti mehanizam kao
-- rls_audit_test: impersonacija u JEDNOJ transakciji koja se na kraju ROLLBACK-uje.
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/dispatcher_test.sql
--   uspeh => 'ALL_DISPATCHER_TESTS_PASSED'; pad => 'FAIL: …'
--
-- Pokriva (dispečer firme A): vidi ture i FINANSIJE (trip_pnl) SVOJE firme; NE vidi tuđe;
--   vidi flotu svoje firme; MOŽE finansijski upis (revenue); NE MOŽE update companies;
--   NE MOŽE dispečersku pozivnicu; MOŽE vozačku; suspend-gate važi (dispečer obustavljene firme).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_s uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_disp uuid := gen_random_uuid(); u_disp_s uuid := gen_random_uuid();
  d_a uuid := gen_random_uuid(); d_b uuid := gen_random_uuid(); d_s uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid(); v_s uuid := gen_random_uuid();
  t_a uuid := gen_random_uuid(); t_b uuid := gen_random_uuid();
  n int; v_num numeric; v_name text; ok boolean;
begin
  -- ═══ FIXTURES (postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_disp,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_disp||'@t.local'),
    (u_disp_s,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_disp_s||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active'), (c_s,'S','suspended');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a,'owner'), (u_disp, c_a,'dispatcher'), (u_disp_s, c_s,'dispatcher');
  insert into drivers (id, company_id, full_name) values (d_a,c_a,'Drv A'), (d_b,c_b,'Drv B'), (d_s,c_s,'Drv S');
  insert into vehicles (id, company_id, registration) values (v_a,c_a,'A-1'), (v_b,c_b,'B-1'), (v_s,c_s,'S-1');
  insert into trips (id, company_id, driver_id, vehicle_id, revenue, start_odometer, end_odometer, status) values
    (t_a, c_a, d_a, v_a, 1000, 0, 100, 'finished'),
    (t_b, c_b, d_b, v_b, 2000, 0, 200, 'finished');

  -- ═══ DISPEČER firme A ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_disp)::text, true);
  set local role authenticated;

  -- vidi svoju firmu (companies select preko id=current_company_id)
  select count(*) into n from companies where id = c_a;
  if n <> 1 then raise exception 'FAIL: dispečer ne vidi svoju firmu'; end if;

  -- TURE: vidi svoje, ne tuđe
  select count(*) into n from trips where company_id = c_a;
  if n <> 1 then raise exception 'FAIL: dispečer ne vidi ture svoje firme (%)', n; end if;
  select count(*) into n from trips where company_id = c_b;
  if n <> 0 then raise exception 'FAIL: dispečer vidi ture firme B (%)', n; end if;

  -- FINANSIJE: trip_pnl svoje firme (P&L), ne tuđe
  select count(*) into n from trip_pnl where company_id = c_a;
  if n <> 1 then raise exception 'FAIL: dispečer ne vidi P&L svoje firme (%)', n; end if;
  select profit into v_num from trip_pnl where trip_id = t_a;
  if v_num <> 1000 then raise exception 'FAIL: dispečer ne vidi profit ture (%)', v_num; end if;
  select count(*) into n from trip_pnl where company_id = c_b;
  if n <> 0 then raise exception 'FAIL: dispečer vidi P&L firme B'; end if;

  -- FLOTA: vozila svoje firme, ne tuđe
  select count(*) into n from vehicles where company_id = c_a;
  if n <> 1 then raise exception 'FAIL: dispečer ne vidi vozila svoje firme'; end if;
  select count(*) into n from vehicles where company_id = c_b;
  if n <> 0 then raise exception 'FAIL: dispečer vidi vozila firme B'; end if;

  -- FINANSIJSKI UPIS (office write): sme da menja vozarinu ture svoje firme
  update trips set revenue = 1500 where id = t_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: dispečer ne može da upiše vozarinu (row_count=%)', n; end if;

  -- COMPANIES update ZABRANJEN (nema owner ni office write politike → 0 redova)
  update companies set name = 'HACK' where id = c_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: dispečer izmenio companies (row_count=%)', n; end if;

  -- DISPEČERSKA POZIVNICA ZABRANJENA
  ok := false;
  begin
    insert into invitations (company_id, created_by, role) values (c_a, u_disp, 'dispatcher');
  exception when others then ok := true;  -- očekivano: RLS (office ali ne owner → samo driver)
  end;
  if not ok then raise exception 'FAIL: dispečer napravio dispečersku pozivnicu'; end if;

  -- VOZAČKA POZIVNICA DOZVOLJENA
  insert into invitations (company_id, created_by, role) values (c_a, u_disp, 'driver');
  select count(*) into n from invitations where company_id = c_a and role = 'driver' and created_by = u_disp;
  if n <> 1 then raise exception 'FAIL: dispečer ne može vozačku pozivnicu'; end if;

  -- ═══ SUSPEND-GATE: dispečer OBUSTAVLJENE firme ne upisuje turu ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_disp_s)::text, true);
  ok := false;
  begin
    insert into trips (company_id, driver_id, vehicle_id, status) values (c_s, d_s, v_s, 'draft');
  exception when others then ok := true;  -- očekivano: RESTRICTIVE suspend-gate
  end;
  if not ok then raise exception 'FAIL: dispečer obustavljene firme upisao turu'; end if;

  raise exception 'ALL_DISPATCHER_TESTS_PASSED';
end $$;
