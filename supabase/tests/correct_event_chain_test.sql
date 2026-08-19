-- ─────────────────────────────────────────────────────────────────────────────
-- correct_trip_event lanac verzija — test (audit B8, tačka 10).
-- Isti mehanizam kao rls_audit_test.sql: impersonacija + rollback sentinel.
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/correct_event_chain_test.sql
--   uspeh => 'ALL_CHAIN_TESTS_PASSED';  pad => 'FAIL: …'
--
-- Pokriva: (1) ispravka pravi NOVU verziju (version+1, is_current), stara ostaje
--              (is_current=false, supersedes_event_id -> stari);
--          (2) IDEMPOTENTNOST: ponovni poziv sa istim p_new_id vraća isti id BEZ
--              duplog upisa (audit B3 / migracija 0016);
--          (3) A2: platform_admin NE može da ispravlja dnevnik (Nije dozvoljeno).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_da uuid := gen_random_uuid(); u_admin uuid := gen_random_uuid();
  d_a uuid := gen_random_uuid(); v_a uuid := gen_random_uuid();
  t_a uuid := gen_random_uuid(); e_a uuid := gen_random_uuid();
  new1 uuid := gen_random_uuid();
  r uuid; n int; cur boolean; ver int; sup uuid; ok boolean;
begin
  -- ═══ FIXTURES ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_da,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_da||'@t.local'),
    (u_admin, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_admin||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a, 'owner'), (u_da, c_a, 'driver'), (u_admin, null, 'platform_admin');
  insert into drivers  (id, company_id, user_id, full_name) values (d_a, c_a, u_da, 'Drv A');
  insert into vehicles (id, company_id, registration)       values (v_a, c_a, 'REG-A');
  insert into trips    (id, company_id, driver_id, vehicle_id, status) values (t_a, c_a, d_a, v_a, 'driving');
  insert into trip_events (id, company_id, trip_id, type, note) values (e_a, c_a, t_a, 'load', 'orig');

  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  set local role authenticated;

  -- ═══ (1) ispravka -> nova verzija ═══
  select correct_trip_event(e_a, new1, null, null, null, 'ispravljeno', 'razlog') into r;
  if r <> new1 then raise exception 'FAIL: correct nije vratio prosleđeni p_new_id'; end if;

  select is_current into cur from trip_events where id = e_a;
  if cur <> false then raise exception 'FAIL: stara verzija nije is_current=false'; end if;

  select is_current, version, supersedes_event_id into cur, ver, sup from trip_events where id = new1;
  if cur <> true then raise exception 'FAIL: nova verzija nije is_current=true'; end if;
  if ver <> 2 then raise exception 'FAIL: nova verzija ima version=% (očekivano 2)', ver; end if;
  if sup is distinct from e_a then raise exception 'FAIL: supersedes_event_id ne pokazuje na staru verziju'; end if;

  select count(*) into n from trip_events where trip_id = t_a;
  if n <> 2 then raise exception 'FAIL: broj verzija = % (očekivano 2)', n; end if;

  -- ═══ (2) IDEMPOTENTNOST: ponovni poziv sa istim p_new_id ═══
  select correct_trip_event(e_a, new1, null, null, null, 'ispravljeno', 'razlog') into r;
  if r <> new1 then raise exception 'FAIL: idempotentni poziv nije vratio isti id'; end if;

  select count(*) into n from trip_events where trip_id = t_a;
  if n <> 2 then raise exception 'FAIL: idempotentni retry napravio dupli upis (redova %, očekivano 2)', n; end if;
  select count(*) into n from trip_events where trip_id = t_a and is_current;
  if n <> 1 then raise exception 'FAIL: tačno jedna is_current verzija; nađeno %', n; end if;

  -- ═══ (3) A2: platform_admin NE ispravlja dnevnik ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin)::text, true);
  ok := false;
  begin
    perform correct_trip_event(new1, gen_random_uuid(), null, null, null, 'admin-pokušaj', 'x');
  exception when others then ok := true;  -- očekivano: 'Nije dozvoljeno'
  end;
  if not ok then raise exception 'FAIL: platform_admin je USPEO da ispravi dnevnik (mora biti odbijen)'; end if;

  raise exception 'ALL_CHAIN_TESTS_PASSED';
end $$;
