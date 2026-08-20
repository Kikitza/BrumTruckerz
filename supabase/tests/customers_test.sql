-- ─────────────────────────────────────────────────────────────────────────────
-- NARUČIOCI test svita (0021: customers + trips.customer_id). Impersonacija u JEDNOJ
-- transakciji koja se na kraju ROLLBACK-uje (sentinel) → READ-ONLY.
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/customers_test.sql
--   uspeh => 'ALL_CUSTOMERS_TESTS_PASSED'; pad => 'FAIL: …'
--
-- Pokriva: office (owner+dispatcher) pun pristup u svojoj firmi; izolacija firmi; vozač 0;
--   platform_admin 0; suspend-gate; RESTRICT brisanja naručioca sa turom (arhiviranje umesto);
--   brisanje bez tura dozvoljeno; driver_trips view NEMA customer kolonu.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_s uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_disp uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid();
  u_drv uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid(); u_disp_s uuid := gen_random_uuid();
  d_a uuid := gen_random_uuid(); v_a uuid := gen_random_uuid();
  cust_a uuid; cust_free uuid; t_a uuid := gen_random_uuid();
  n int; ok boolean;
begin
  -- ═══ FIXTURES (postgres) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_disp,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_disp||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_drv,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_drv||'@t.local'),
    (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_admin||'@t.local'),
    (u_disp_s,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_disp_s||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active'), (c_s,'S','suspended');
  insert into app_users (id, company_id, role) values
    (u_oa,c_a,'owner'), (u_disp,c_a,'dispatcher'), (u_ob,c_b,'owner'),
    (u_drv,c_a,'driver'), (u_admin,null,'platform_admin'), (u_disp_s,c_s,'dispatcher');
  insert into drivers (id, company_id, user_id, full_name) values (d_a, c_a, u_drv, 'Drv A');
  insert into vehicles (id, company_id, registration) values (v_a, c_a, 'A-1');

  set local role authenticated;

  -- ═══ OWNER A: insert naručilaca + tura sa naručiocem ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  insert into customers (company_id, name, vat_number) values (c_a, 'Klijent A', 'RS123') returning id into cust_a;
  insert into customers (company_id, name) values (c_a, 'Klijent bez tura') returning id into cust_free;
  insert into trips (company_id, driver_id, vehicle_id, status, customer_id)
    values (c_a, d_a, v_a, 'draft', cust_a) returning id into t_a;

  select count(*) into n from customers where company_id = c_a;
  if n <> 2 then raise exception 'FAIL: owner A ne vidi svoje naručioce (%)', n; end if;

  -- ═══ DISPEČER A: pun pristup (vidi + menja) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_disp)::text, true);
  select count(*) into n from customers;
  if n <> 2 then raise exception 'FAIL: dispečer A ne vidi naručioce firme (%)', n; end if;
  update customers set note = 'disp' where id = cust_free;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: dispečer A ne može da menja naručioca'; end if;

  -- ═══ IZOLACIJA: owner B ne vidi A ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from customers where company_id = c_a;
  if n <> 0 then raise exception 'FAIL: owner B vidi naručioce firme A (%)', n; end if;
  select count(*) into n from customers;
  if n <> 0 then raise exception 'FAIL: owner B vidi tuđe naručioce (%)', n; end if;

  -- ═══ VOZAČ: 0 (finansijska sfera) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_drv)::text, true);
  select count(*) into n from customers;
  if n <> 0 then raise exception 'FAIL: vozač vidi naručioce (%)', n; end if;

  -- ═══ PLATFORM_ADMIN: 0 (poslovni sadržaj) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin)::text, true);
  select count(*) into n from customers;
  if n <> 0 then raise exception 'FAIL: admin vidi naručioce (%)', n; end if;

  -- ═══ SUSPEND-GATE: dispečer obustavljene firme ne upisuje naručioca ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_disp_s)::text, true);
  ok := false;
  begin
    insert into customers (company_id, name) values (c_s, 'Ne sme');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: naručilac u OBUSTAVLJENU firmu NIJE blokiran'; end if;

  -- ═══ RESTRICT: naručilac SA turom se ne briše; arhivira se; bez tura se briše ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  ok := false;
  begin
    delete from customers where id = cust_a;  -- ima turu t_a → RESTRICT
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: brisanje naručioca SA turom nije blokirano (RESTRICT)'; end if;

  update customers set archived_at = now() where id = cust_a;  -- arhiviranje umesto brisanja
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: arhiviranje naručioca sa turom ne radi'; end if;

  delete from customers where id = cust_free;  -- bez tura → dozvoljeno
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: brisanje naručioca BEZ tura nije prošlo'; end if;

  -- ═══ driver_trips view NEMA customer kolonu (vozač naručioca ne vidi nigde) ═══
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'driver_trips' and column_name = 'customer_id';
  if n <> 0 then raise exception 'FAIL: driver_trips view IMA customer_id kolonu'; end if;

  raise exception 'ALL_CUSTOMERS_TESTS_PASSED';
end $$;
