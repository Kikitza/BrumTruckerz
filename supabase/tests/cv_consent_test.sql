-- ─────────────────────────────────────────────────────────────────────────────
-- PUN CV UZ PRISTANAK (v2-3 kriška 3, ADR 0014) test svita. Impersonacija + rollback.
-- Pokriva:
--   (A) BEZ pristanka office vidi SAMO svoju firmu (company-scope) — nepromenjeno;
--   (B) firma van zaposlenja bez pristanka → 'none' (career RPC 42501);
--   (C) „Zatraži CV" idempotentno + cv_access='requested';
--   (D) radnik ODOBRI → pristanak granted;
--   (E) granted → PUN CV (sve firme) + cv_access='granted';
--   (F) pristanak > company: firma zaposlenja sa pristankom vidi PUN CV;
--   (H) izolacija: firma A ne vidi pristanke firme B; office ne može da upiše pristanak;
--   (I) radnik upravlja samo SVOJIM (office ne može da opozove tuđi pristanak);
--   (G) OPOZIV momentalno gasi pristup.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_c uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid(); u_w uuid := gen_random_uuid();
  d_w uuid := gen_random_uuid();
  n int; km bigint; v_req uuid; v_req2 uuid; v_status text; ok boolean;
begin
  -- ═══ FIXTURES ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_w, '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_w||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active'), (c_c,'C','active');
  insert into app_users (id, company_id, role, active_company_id) values
    (u_oa, c_a, 'owner', c_a), (u_ob, c_b, 'owner', c_b), (u_w, c_b, 'driver', c_b);
  insert into memberships (user_id, company_id, role, status) values
    (u_oa, c_a, 'owner', 'active'), (u_ob, c_b, 'owner', 'active'), (u_w, c_b, 'driver', 'active');
  insert into drivers (id, company_id, user_id, full_name) values (d_w, c_b, u_w, 'Radnik W');
  insert into driver_profiles (user_id, display_name) values (u_w, 'Radnik W');
  -- CV kroz DVE firme: aktivan u B, završen u C.
  insert into employments (company_id, user_id, role_on_company, started_at, status) values
    (c_b, u_w, 'driver', '2025-01-01', 'active');
  insert into employments (company_id, user_id, role_on_company, started_at, ended_at, status) values
    (c_c, u_w, 'driver', '2024-01-01', '2024-12-31', 'ended');
  -- Rollup (isti drivers red, različite firme): B=1000km/5, C=500km/3 → self ukupno 1500/8.
  insert into driver_month_rollup (company_id, driver_id, year_month, trips_count, total_km) values
    (c_b, d_w, '2025-01-01', 5, 1000), (c_c, d_w, '2024-06-01', 3, 500);

  set local role authenticated;

  -- ═══ (A) Office B BEZ pristanka → company-scope (samo B: 1 firma, 1000 km) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  if career_view_mode(u_w) <> 'company' then raise exception 'FAIL: office B nije company mode'; end if;
  select companies_count, total_km into n, km from career_summary(u_w);
  if n <> 1 or km <> 1000 then raise exception 'FAIL: company-scope pogrešan (firme=%, km=%)', n, km; end if;

  -- ═══ (B) Office A (radnik NIJE u A) bez pristanka → none ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  if career_view_mode(u_w) <> 'none' then raise exception 'FAIL: office A nije none'; end if;
  ok := false;
  begin perform career_summary(u_w); exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: career_summary bez pristanka nije odbijen'; end if;

  -- ═══ (C) „Zatraži CV" idempotentno ═══
  select (cv_request(u_w))->>'request_id' into v_req;
  select cv_request(u_w) ->> 'status' into v_status;
  if v_status <> 'already_pending' then raise exception 'FAIL: drugi cv_request nije already_pending (%)', v_status; end if;
  if cv_access(u_w) <> 'requested' then raise exception 'FAIL: cv_access nije requested'; end if;

  -- ═══ (D) Radnik ODOBRI ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_w)::text, true);
  select count(*) into n from my_cv_requests();
  if n <> 1 then raise exception 'FAIL: radnik ne vidi zahtev (n=%)', n; end if;
  perform respond_cv_request(v_req, true);
  select count(*) into n from cv_consents where worker_user_id = u_w and company_id = c_a and status = 'granted';
  if n <> 1 then raise exception 'FAIL: pristanak nije kreiran'; end if;

  -- ═══ (E) Office A sa pristankom → PUN CV (2 firme, 1500 km) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  if career_view_mode(u_w) <> 'consented' then raise exception 'FAIL: office A nije consented'; end if;
  select companies_count, total_km into n, km from career_summary(u_w);
  if n <> 2 or km <> 1500 then raise exception 'FAIL: consented nije PUN CV (firme=%, km=%)', n, km; end if;
  if cv_access(u_w) <> 'granted' then raise exception 'FAIL: cv_access nije granted'; end if;

  -- ═══ (F) Pristanak > company: firma B (zaposlenje) sa pristankom vidi PUN CV ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select (cv_request(u_w))->>'request_id' into v_req2;
  perform set_config('request.jwt.claims', json_build_object('sub', u_w)::text, true);
  perform respond_cv_request(v_req2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  if career_view_mode(u_w) <> 'consented' then raise exception 'FAIL: office B sa pristankom nije consented'; end if;
  select companies_count into n from career_summary(u_w);
  if n <> 2 then raise exception 'FAIL: pristanak ne nadjačava company-scope (firme=%)', n; end if;

  -- ═══ (H) Izolacija: office A vidi SAMO pristanke svoje firme; ne može da upiše ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select count(*) into n from cv_consents where company_id = c_b;   -- pristanak dat firmi B
  if n <> 0 then raise exception 'FAIL: firma A vidi pristanke firme B (n=%)', n; end if;
  select count(*) into n from cv_consents;                          -- vidi samo svoje (A)
  if n <> 1 then raise exception 'FAIL: office A vidi % pristanaka (očekivano 1, samo svoj)', n; end if;
  ok := false;
  begin insert into cv_consents (worker_user_id, company_id) values (u_w, c_a);
  exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: office je upisao pristanak direktno (nema RLS insert)'; end if;

  -- ═══ (I) Radnik upravlja SVOJIM: office ne može da opozove tuđi pristanak ═══
  ok := false;
  begin perform revoke_cv_consent(c_a); exception when others then ok := (sqlstate = '42704'); end;
  if not ok then raise exception 'FAIL: office je opozvao tuđi pristanak'; end if;

  -- radnik vidi oba svoja pristanka
  perform set_config('request.jwt.claims', json_build_object('sub', u_w)::text, true);
  select count(*) into n from my_cv_consents();
  if n <> 2 then raise exception 'FAIL: radnik ne vidi 2 svoja pristanka (n=%)', n; end if;

  -- ═══ (G) OPOZIV momentalno gasi pristup ═══
  perform revoke_cv_consent(c_a);
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  if career_view_mode(u_w) <> 'none' then raise exception 'FAIL: posle opoziva office A nije none'; end if;
  ok := false;
  begin perform career_summary(u_w); exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: posle opoziva CV i dalje dostupan'; end if;

  raise exception 'ALL_CV_CONSENT_TESTS_PASSED';
end $$;
