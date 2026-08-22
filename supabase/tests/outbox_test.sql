-- ─────────────────────────────────────────────────────────────────────────────
-- Outbox (v2-2 kriška 1) test svita. Isti mehanizam kao ostali: impersonacija kroz
-- request.jwt.claims + `set local role authenticated`, sve u JEDNOJ transakciji koja
-- se ROLLBACK-uje (sentinel raise) → STROGO READ-ONLY nad DEV bazom.
--
-- Pokriva (ADR 0012 → TESTOVI ČUVARI):
--   (1) DIREKTAN RLS upis (owner insert trips) → trip.created (payload/actor/company);
--   (2) ATOMIČNOST: rollback poslovne promene ⇒ event NE preživljava (isti subtx);
--   (3) RPC put (SECURITY DEFINER funkcija menja driver_id) → driver.assigned — dokaz
--       da trigeri pokrivaju I RPC put, ne samo direktan RLS upis;
--   (4) route.changed na insert/delete stanice; document.uploaded na attachment insert;
--   (5) TENANT IZOLACIJA: firma A ne vidi outbox firme B (RLS);
--   (6) VOZAČ ne vidi outbox (nema office ulogu → 0 redova).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid(); u_dr uuid := gen_random_uuid();
  u_d1 uuid := gen_random_uuid(); u_d2 uuid := gen_random_uuid(); u_pa uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); d_drv uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid(); t_roll uuid := gen_random_uuid(); t_b uuid := gen_random_uuid();
  st uuid := gen_random_uuid(); at1 uuid := gen_random_uuid();
  cust_a uuid := gen_random_uuid(); inv_a uuid := gen_random_uuid(); emp_a uuid := gen_random_uuid();
  n int; v_actor uuid; v_prev uuid; v_new uuid; v_ps text; v_ns text;
begin
  -- ═══ FIXTURES (kao postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_dr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_dr||'@t.local'),
    (u_d1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_d1||'@t.local'),
    (u_d2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_d2||'@t.local'),
    (u_pa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_pa||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a, 'owner'), (u_ob, c_b, 'owner'), (u_dr, c_a, 'driver'),
    (u_d1, c_a, 'driver'), (u_d2, c_a, 'driver'), (u_pa, c_a, 'platform_admin');
  insert into drivers (id, company_id, user_id, full_name) values
    (d1, c_a, u_d1, 'D1'), (d2, c_a, u_d2, 'D2'), (d_drv, c_a, u_dr, 'DRV');
  insert into vehicles (id, company_id, registration) values (v_a, c_a, 'A-1'), (v_b, c_b, 'B-1');
  -- Za invoice/customer/employment evente (upis kao postgres → fire trigera; actor null).
  insert into customers (id, company_id, name, country_code) values (cust_a, c_a, 'Cust A', 'RS');
  insert into invoices (id, company_id, customer_id, invoice_no, amount, total, status)
    values (inv_a, c_a, cust_a, 'INV-1', 100, 100, 'issued');
  insert into employments (id, company_id, user_id, role_on_company, started_at, status)
    values (emp_a, c_a, u_d1, 'driver', current_date, 'active');

  -- SECURITY DEFINER pomoćnik = simulira RPC put upisa (menja trojku mimo direktnog RLS-a).
  create or replace function public._test_reassign(p_trip uuid, p_driver uuid)
    returns void language sql security definer set search_path = public as $f$
    update public.trips set driver_id = p_driver where id = p_trip;
  $f$;
  grant execute on function public._test_reassign(uuid, uuid) to authenticated;

  set local role authenticated;

  -- ═══ (1) DIREKTAN RLS upis: owner firme A pravi turu → trip.created ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  insert into trips (id, company_id, driver_id, vehicle_id, status)
    values (t1, c_a, d1, v_a, 'draft');
  select count(*) into n from outbox_events where event_type='trip.created' and aggregate_id=t1;
  if n <> 1 then raise exception 'FAIL: trip.created za t1 = % (očekivano 1)', n; end if;
  select actor_user_id into v_actor from outbox_events where event_type='trip.created' and aggregate_id=t1;
  if v_actor <> u_oa then raise exception 'FAIL: actor_user_id = % (očekivano owner A)', v_actor; end if;
  select count(*) into n from outbox_events
    where aggregate_id=t1 and event_type='trip.created' and company_id=c_a
      and (payload->>'driver_id')::uuid = d1;
  if n <> 1 then raise exception 'FAIL: trip.created payload/company netačan'; end if;

  -- ═══ (2) ATOMIČNOST: event živi u ISTOJ transakciji sa poslovnom promenom ═══
  -- Insert ture u subtransakciji koja se rollback-uje → event NE sme preživeti.
  begin
    insert into trips (id, company_id, driver_id, vehicle_id, status)
      values (t_roll, c_a, d1, v_a, 'draft');
    raise exception 'ROLLBACK_SENTINEL';
  exception when others then
    if sqlstate <> 'P0001' then raise; end if; -- samo naš sentinel gutamo
  end;
  select count(*) into n from outbox_events where aggregate_id=t_roll;
  if n <> 0 then raise exception 'FAIL: event preživeo rollback poslovne promene = % (atomičnost)', n; end if;

  -- ═══ (3) RPC put (SECURITY DEFINER) menja vozača → driver.assigned ═══
  perform public._test_reassign(t1, d2);
  select count(*) into n from outbox_events where event_type='driver.assigned' and aggregate_id=t1;
  if n <> 1 then raise exception 'FAIL: driver.assigned (RPC put) = % (očekivano 1)', n; end if;
  select (payload->>'prev_driver_id')::uuid, (payload->>'driver_id')::uuid into v_prev, v_new
    from outbox_events where event_type='driver.assigned' and aggregate_id=t1;
  if v_prev <> d1 or v_new <> d2 then
    raise exception 'FAIL: driver.assigned payload prev=% new=% (očekivano %/%)', v_prev, v_new, d1, d2;
  end if;

  -- ═══ (4) route.changed (insert/delete stanice) + document.uploaded (attachment) ═══
  insert into trip_stops (id, trip_id, seq, kind, place) values (st, t1, 1, 'loading', 'Beograd');
  select count(*) into n from outbox_events
    where event_type='route.changed' and aggregate_id=t1 and payload->>'op'='insert';
  if n <> 1 then raise exception 'FAIL: route.changed(insert) = % (očekivano 1)', n; end if;
  delete from trip_stops where id = st;
  select count(*) into n from outbox_events
    where event_type='route.changed' and aggregate_id=t1 and payload->>'op'='delete';
  if n <> 1 then raise exception 'FAIL: route.changed(delete) = % (očekivano 1)', n; end if;

  insert into attachments (id, company_id, trip_id, kind, storage_key)
    values (at1, c_a, t1, 'cmr', c_a||'/'||t1||'/x.jpg');
  select count(*) into n from outbox_events where event_type='document.uploaded' and aggregate_id=at1;
  if n <> 1 then raise exception 'FAIL: document.uploaded = % (očekivano 1)', n; end if;

  -- ═══ (A) audit_log dobija red UZ SVAKI event (paritet outbox↔audit) ═══
  select count(*) into n from audit_log where action='trip.created' and aggregate_id=t1;
  if n <> 1 then raise exception 'FAIL: audit_log nema red za trip.created (paritet) = %', n; end if;
  select count(*) into n from audit_log where action='document.uploaded' and aggregate_id=at1;
  if n <> 1 then raise exception 'FAIL: audit_log nema red za document.uploaded = %', n; end if;

  -- ═══ (B) trip.status_changed (prev/new) + (C) trip.completed ═══
  update trips set status='loading' where id=t1;
  select (payload->>'prev_status'), (payload->>'status') into v_ps, v_ns
    from outbox_events where event_type='trip.status_changed' and aggregate_id=t1;
  if v_ps <> 'draft' or v_ns <> 'loading' then
    raise exception 'FAIL: trip.status_changed prev=% new=% (očekivano draft/loading)', v_ps, v_ns;
  end if;
  update trips set status='finished', finished_at=now() where id=t1;
  select count(*) into n from outbox_events where event_type='trip.completed' and aggregate_id=t1;
  if n <> 1 then raise exception 'FAIL: trip.completed = % (očekivano 1)', n; end if;

  -- ═══ (D) invoice.issued (fixture INSERT — RPC put) + invoice.paid (UPDATE) ═══
  select count(*) into n from outbox_events where event_type='invoice.issued' and aggregate_id=inv_a;
  if n <> 1 then raise exception 'FAIL: invoice.issued = % (očekivano 1)', n; end if;
  update invoices set status='paid', paid_at=current_date where id=inv_a;
  select count(*) into n from outbox_events where event_type='invoice.paid' and aggregate_id=inv_a;
  if n <> 1 then raise exception 'FAIL: invoice.paid = % (očekivano 1)', n; end if;

  -- ═══ (E) customer.created + (F) employment.started/ended ═══
  select count(*) into n from outbox_events where event_type='customer.created' and aggregate_id=cust_a;
  if n <> 1 then raise exception 'FAIL: customer.created = % (očekivano 1)', n; end if;
  select count(*) into n from outbox_events where event_type='employment.started' and aggregate_id=emp_a;
  if n <> 1 then raise exception 'FAIL: employment.started = % (očekivano 1)', n; end if;
  update employments set status='ended', ended_at=current_date where id=emp_a;
  select count(*) into n from outbox_events where event_type='employment.ended' and aggregate_id=emp_a;
  if n <> 1 then raise exception 'FAIL: employment.ended = % (očekivano 1)', n; end if;

  -- ═══ (5) TENANT IZOLACIJA: owner A vidi SVOJE evente, NE vidi firmu B ═══
  -- owner B pravi svoju turu (event za c_b).
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  insert into trips (id, company_id, driver_id, vehicle_id, status)
    values (t_b, c_b, d1, v_b, 'draft'); -- d1 je iz A ali FK dozvoljava; bitan je company_id eventa
  select count(*) into n from outbox_events where company_id = c_a; -- owner B ne sme videti A
  if n <> 0 then raise exception 'FAIL: owner B vidi % evenata firme A (mora 0)', n; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select count(*) into n from outbox_events where company_id = c_b; -- owner A ne sme videti B
  if n <> 0 then raise exception 'FAIL: owner A vidi % evenata firme B (mora 0)', n; end if;

  -- ═══ (6) VOZAČ ne vidi outbox NI audit (nema office ulogu) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_dr)::text, true);
  select count(*) into n from outbox_events;
  if n <> 0 then raise exception 'FAIL: vozač vidi % outbox redova (mora 0)', n; end if;
  select count(*) into n from audit_log;
  if n <> 0 then raise exception 'FAIL: vozač vidi % audit redova (mora 0)', n; end if;

  -- ═══ (G) audit_log tenant izolacija (owner A ↔ B) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select count(*) into n from audit_log where company_id = c_a; -- owner A vidi svoju firmu
  if n = 0 then raise exception 'FAIL: owner A ne vidi audit svoje firme (očekivano >0)'; end if;
  select count(*) into n from audit_log where company_id = c_b;
  if n <> 0 then raise exception 'FAIL: owner A vidi % audit redova firme B (mora 0)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from audit_log where company_id = c_a;
  if n <> 0 then raise exception 'FAIL: owner B vidi % audit redova firme A (mora 0)', n; end if;

  -- ═══ (H) platform_admin NE vidi audit ni outbox (poslovni sadržaj) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_pa)::text, true);
  select count(*) into n from audit_log;
  if n <> 0 then raise exception 'FAIL: platform_admin vidi % audit redova (mora 0)', n; end if;
  select count(*) into n from outbox_events;
  if n <> 0 then raise exception 'FAIL: platform_admin vidi % outbox redova (mora 0)', n; end if;

  -- ═══ (J) audit_log je NEPROMENJIV: update/delete ne diraju nijedan red (nema politike) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  update audit_log set summary = '{}'::jsonb where company_id = c_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: audit_log dozvolio UPDATE (% redova)', n; end if;
  delete from audit_log where company_id = c_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: audit_log dozvolio DELETE (% redova)', n; end if;

  -- Sve prošlo → namerni rollback (read-only; briše i _test_reassign).
  raise exception 'ALL_OUTBOX_TESTS_PASSED';
end $$;
