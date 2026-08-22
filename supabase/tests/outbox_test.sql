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
  u_d1 uuid := gen_random_uuid(); u_d2 uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); d_drv uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid(); t_roll uuid := gen_random_uuid(); t_b uuid := gen_random_uuid();
  st uuid := gen_random_uuid(); at1 uuid := gen_random_uuid();
  n int; v_actor uuid; v_prev uuid; v_new uuid;
begin
  -- ═══ FIXTURES (kao postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_dr,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_dr||'@t.local'),
    (u_d1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_d1||'@t.local'),
    (u_d2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_d2||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a, 'owner'), (u_ob, c_b, 'owner'), (u_dr, c_a, 'driver'),
    (u_d1, c_a, 'driver'), (u_d2, c_a, 'driver');
  insert into drivers (id, company_id, user_id, full_name) values
    (d1, c_a, u_d1, 'D1'), (d2, c_a, u_d2, 'D2'), (d_drv, c_a, u_dr, 'DRV');
  insert into vehicles (id, company_id, registration) values (v_a, c_a, 'A-1'), (v_b, c_b, 'B-1');

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

  -- ═══ (6) VOZAČ ne vidi outbox (nema office ulogu) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_dr)::text, true);
  select count(*) into n from outbox_events;
  if n <> 0 then raise exception 'FAIL: vozač vidi % outbox redova (mora 0)', n; end if;

  -- Sve prošlo → namerni rollback (read-only; briše i _test_reassign).
  raise exception 'ALL_OUTBOX_TESTS_PASSED';
end $$;
