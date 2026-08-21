-- ─────────────────────────────────────────────────────────────────────────────
-- Career (v2-1) test svita. Isti mehanizam kao rls_audit: impersonacija kroz
-- request.jwt.claims + `set local role authenticated`, sve u JEDNOJ transakciji
-- koja se ROLLBACK-uje (sentinel raise) → STROGO READ-ONLY nad DEV bazom.
--
-- Pokriva:
--   (a) radnik (self) vidi SVOJ CV kroz sve firme (zbir km/tura, broj firmi, zaposlenja);
--   (b) radnik NE vidi CV drugog radnika (career_* → izuzetak 42501);
--   (c) office (owner) firme B vidi CV radnika, ali SAMO podatke firme B (ne firme A);
--   (d) office firme A vidi SAMO podatke firme A (izolacija perioda po firmi);
--   (e) office firme A NE vidi radnika koji nije zaposlen u firmi A (42501).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid();
  u_w uuid := gen_random_uuid(); u_w2 uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid();
  d_w uuid := gen_random_uuid(); d_w2 uuid := gen_random_uuid();
  v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
  t_a uuid := gen_random_uuid(); t_b uuid := gen_random_uuid();
  km_v bigint; tr_v bigint; co_v int; n int; mode text; ok boolean;
begin
  -- ═══ FIXTURES (kao postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_w,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_w||'@t.local'),
    (u_w2, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_w2||'@t.local'),
    (u_oa, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active');
  -- Radnik W: trenutna firma B (aktivno); ranije radio u A (završeno).
  insert into app_users (id, company_id, role) values
    (u_w, c_b, 'driver'), (u_w2, c_b, 'driver'), (u_oa, c_a, 'owner'), (u_ob, c_b, 'owner');
  -- JEDAN drivers red po osobi (drivers.user_id je globalno jedinstven, 0007).
  -- Istorija po firmama živi na trips/rollup.company_id, ne na više drivers redova.
  insert into drivers (id, company_id, user_id, full_name) values
    (d_w, c_b, u_w, 'W'), (d_w2, c_b, u_w2, 'W2');
  insert into driver_profiles (user_id, display_name) values (u_w, 'W'), (u_w2, 'W2');
  -- Zaposlenja: A (završeno 2024), B (aktivno od 2025).
  insert into employments (company_id, user_id, role_on_company, started_at, ended_at, status) values
    (c_a, u_w, 'driver', date '2024-01-01', date '2024-12-31', 'ended'),
    (c_b, u_w, 'driver', date '2025-01-01', null, 'active'),
    (c_b, u_w2,'driver', date '2025-01-01', null, 'active');
  -- Rollup istog vozača, ali po firmama: A = 1000 km / 2 ture; B = 2000 km / 3 ture.
  insert into driver_month_rollup (company_id, driver_id, year_month, trips_count, total_km) values
    (c_a, d_w, date '2024-03-01', 2, 1000),
    (c_b, d_w, date '2025-02-01', 3, 2000);
  -- Zemlje (0028): tura u A → origin DE + stanica AT; tura u B → origin IT + stanica SI.
  insert into vehicles (id, company_id, registration) values (v_a, c_a, 'A-1'), (v_b, c_b, 'B-1');
  insert into trips (id, company_id, driver_id, vehicle_id, status, origin_country_code) values
    (t_a, c_a, d_w, v_a, 'finished', 'DE'),
    (t_b, c_b, d_w, v_b, 'finished', 'IT');
  insert into trip_stops (trip_id, seq, kind, place, country_code) values
    (t_a, 1, 'unloading', 'Wien',  'AT'),
    (t_b, 1, 'unloading', 'Koper', 'SI');

  set local role authenticated;

  -- ═══ (a) SELF: radnik W vidi CEO svoj CV (A+B) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_w)::text, true);
  select career_view_mode(u_w) into mode;
  if mode <> 'self' then raise exception 'FAIL: W self mode = % (očekivano self)', mode; end if;

  select total_km, trips_count, companies_count into km_v, tr_v, co_v from career_summary(null);
  if km_v <> 3000 then raise exception 'FAIL: W self total_km = % (očekivano 3000)', km_v; end if;
  if tr_v <> 5    then raise exception 'FAIL: W self trips = % (očekivano 5)', tr_v; end if;
  if co_v <> 2    then raise exception 'FAIL: W self companies = % (očekivano 2)', co_v; end if;

  select count(*) into n from career_employments(null);
  if n <> 2 then raise exception 'FAIL: W self employments = % (očekivano 2)', n; end if;
  select count(*) into n from career_km_series(null);
  if n <> 2 then raise exception 'FAIL: W self km_series = % (očekivano 2)', n; end if;

  -- zemlje self: DE, AT (A) + IT, SI (B) = 4
  select count(*) into n from career_countries(null);
  if n <> 4 then raise exception 'FAIL: W self countries = % (očekivano 4)', n; end if;

  -- ═══ (b) radnik NE vidi tuđi CV ═══
  ok := false;
  begin
    perform 1 from career_summary(u_w2);
  exception when others then ok := (sqlstate = '42501');
  end;
  if not ok then raise exception 'FAIL: W je video CV drugog radnika (mora 42501)'; end if;

  -- ═══ (c) OFFICE firme B: vidi W, ali SAMO podatke firme B ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select career_view_mode(u_w) into mode;
  if mode <> 'company' then raise exception 'FAIL: ownerB mode za W = % (očekivano company)', mode; end if;

  select total_km, companies_count into km_v, co_v from career_summary(u_w);
  if km_v <> 2000 then raise exception 'FAIL: ownerB vidi W total_km = % (očekivano 2000 — samo B)', km_v; end if;
  if co_v <> 1    then raise exception 'FAIL: ownerB vidi W companies = % (očekivano 1)', co_v; end if;
  select count(*) into n from career_employments(u_w);
  if n <> 1 then raise exception 'FAIL: ownerB vidi W employments = % (očekivano 1 — samo B)', n; end if;
  -- zemlje: office B vidi samo B (IT, SI) = 2; NE vidi DE/AT iz firme A
  select count(*) into n from career_countries(u_w);
  if n <> 2 then raise exception 'FAIL: ownerB vidi W countries = % (očekivano 2 — samo B)', n; end if;
  select count(*) into n from career_countries(u_w) where country_code = 'DE';
  if n <> 0 then raise exception 'FAIL: ownerB vidi zemlju DE iz firme A (mora 0)'; end if;

  -- ═══ (d) OFFICE firme A: vidi W, ali SAMO podatke firme A (izolacija perioda) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select total_km into km_v from career_summary(u_w);
  if km_v <> 1000 then raise exception 'FAIL: ownerA vidi W total_km = % (očekivano 1000 — samo A)', km_v; end if;
  select count(*) into n from career_employments(u_w);
  if n <> 1 then raise exception 'FAIL: ownerA vidi W employments = % (očekivano 1 — samo A)', n; end if;
  -- zemlje: office A vidi samo A (DE, AT) = 2
  select count(*) into n from career_countries(u_w);
  if n <> 2 then raise exception 'FAIL: ownerA vidi W countries = % (očekivano 2 — samo A)', n; end if;

  -- ═══ (e) OFFICE firme A NE vidi radnika koji nije u firmi A (u_w2 je samo u B) ═══
  select career_view_mode(u_w2) into mode;
  if mode <> 'none' then raise exception 'FAIL: ownerA mode za W2 = % (očekivano none)', mode; end if;
  ok := false;
  begin
    perform 1 from career_summary(u_w2);
  exception when others then ok := (sqlstate = '42501');
  end;
  if not ok then raise exception 'FAIL: ownerA je video CV radnika druge firme (mora 42501)'; end if;

  -- Sve prošlo → namerni rollback (read-only).
  raise exception 'ALL_CAREER_TESTS_PASSED';
end $$;
