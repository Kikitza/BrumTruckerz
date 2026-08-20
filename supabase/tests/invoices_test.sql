-- ─────────────────────────────────────────────────────────────────────────────
-- FAKTURE test svita (0023). Impersonacija u JEDNOJ transakciji, ROLLBACK (sentinel).
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/invoices_test.sql
--   uspeh => 'ALL_INVOICES_TESTS_PASSED'; pad => 'FAIL: …'
--
-- Pokriva: office izolacija; vozač 0; admin 0; suspend (issue blokiran); numeracija bez
--   rupa/duplikata (001,002,003…); unique po firmi+godini; storno NE oslobađa broj;
--   RESTRICT na turu (ne briši turu sa fakturom); obračun round2.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_s uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_disp uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid();
  u_drv uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid(); u_disp_s uuid := gen_random_uuid();
  cust_a uuid; cust_b uuid; cust_s uuid;
  d_a uuid := gen_random_uuid(); v_a uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); t3 uuid := gen_random_uuid();
  no1 text; no2 text; no3 text; n int; ok boolean; v_total numeric; v_vat numeric;
begin
  -- ═══ FIXTURES ═══
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
  insert into customers (id, company_id, name) values
    (gen_random_uuid(), c_a, 'Klijent A') returning id into cust_a;
  insert into customers (company_id, name) values (c_b, 'Klijent B') returning id into cust_b;
  insert into customers (company_id, name) values (c_s, 'Klijent S') returning id into cust_s;
  insert into trips (id, company_id, driver_id, vehicle_id, status, customer_id, revenue) values
    (t1, c_a, d_a, v_a, 'finished', cust_a, 1000),
    (t2, c_a, d_a, v_a, 'finished', cust_a, 500),
    (t3, c_a, d_a, v_a, 'finished', cust_a, 300);

  set local role authenticated;

  -- ═══ OWNER A: izdavanje + numeracija + obračun ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select invoice_no into no1 from issue_invoice(cust_a, t1, 'EUR', 1000, 20, null, null, null) as x;
  select invoice_no into no2 from issue_invoice(cust_a, t2, 'EUR', 500, 20, null, null, null) as x;
  if no1 !~ '^\d{4}-001$' then raise exception 'FAIL: prvi broj nije …-001 (%)', no1; end if;
  if no2 !~ '^\d{4}-002$' then raise exception 'FAIL: drugi broj nije …-002 (%)', no2; end if;

  -- obračun round2 (1000 @ 20% = PDV 200, ukupno 1200)
  select vat_amount, total into v_vat, v_total from invoices where invoice_no = no1 and company_id = c_a;
  if v_vat <> 200 or v_total <> 1200 then raise exception 'FAIL: obračun pogrešan (pdv=%, ukupno=%)', v_vat, v_total; end if;

  -- ═══ DISPEČER A: vidi + može da menja (plaćeno) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_disp)::text, true);
  select count(*) into n from invoices;
  if n <> 2 then raise exception 'FAIL: dispečer A ne vidi fakture firme (%)', n; end if;
  update invoices set status = 'paid', paid_at = current_date where invoice_no = no1 and company_id = c_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: dispečer A ne može da označi plaćeno'; end if;

  -- ═══ IZOLACIJA: owner B ne vidi A ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from invoices;
  if n <> 0 then raise exception 'FAIL: owner B vidi fakture firme A (%)', n; end if;

  -- ═══ VOZAČ 0 / ADMIN 0 ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_drv)::text, true);
  select count(*) into n from invoices;
  if n <> 0 then raise exception 'FAIL: vozač vidi fakture (%)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin)::text, true);
  select count(*) into n from invoices;
  if n <> 0 then raise exception 'FAIL: admin vidi fakture (%)', n; end if;

  -- ═══ STORNO ne oslobađa broj: storniraj 002, izdaj 003 ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  update invoices set status = 'cancelled', cancel_reason = 'test' where invoice_no = no2 and company_id = c_a;
  select invoice_no into no3 from issue_invoice(cust_a, t3, 'EUR', 300, 0, null, null, null) as x;
  if no3 !~ '^\d{4}-003$' then raise exception 'FAIL: storno oslobodio broj — dobijeno % (očekivano …-003)', no3; end if;

  -- ═══ UNIQUE po firmi+godini (direktan dupli upis kao postgres → constraint puca) ═══
  reset role;
  ok := false;
  begin
    insert into invoices (company_id, customer_id, invoice_no, amount, total)
      values (c_a, cust_a, no1, 1, 1);  -- no1 već postoji u firmi A
  exception when unique_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: dupli invoice_no u firmi NIJE odbijen'; end if;

  -- ═══ RESTRICT: tura sa fakturom se ne briše ═══
  ok := false;
  begin
    delete from trips where id = t1;  -- t1 ima fakturu no1
  exception when foreign_key_violation then ok := true;
  end;
  if not ok then raise exception 'FAIL: brisanje ture sa fakturom nije blokirano (RESTRICT)'; end if;

  -- ═══ SUSPEND: dispečer obustavljene firme ne izdaje ═══
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_disp_s)::text, true);
  ok := false;
  begin
    perform issue_invoice(cust_s, null, 'EUR', 100, 0, null, null, null);
  exception when others then ok := true;  -- očekivano: COMPANY_SUSPENDED
  end;
  if not ok then raise exception 'FAIL: izdavanje u OBUSTAVLJENU firmu nije blokirano'; end if;

  raise exception 'ALL_INVOICES_TESTS_PASSED';
end $$;
