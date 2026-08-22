-- ─────────────────────────────────────────────────────────────────────────────
-- RADNIK BEZ FIRME (v2-3 kriška 2b, ADR 0013 dopuna / 0036) test svita.
-- Impersonacija + rollback (sentinel), read-only. Pokriva:
--   (0) CONSTRAINT invarijanta: role-bez-firme odbijen; prazan identitet dozvoljen;
--   (1) ensure_identity() kreira ČIST identitet, IDEMPOTENTNO (role/company NULL);
--   (2) ensure_worker_public_no('driver') dodeljuje BT-D; radnik pravi mrežni profil;
--   (3) VIDLJIV u network_search (sa javnim brojem, bez PII) i BEZ ijedne firme;
--   (4) career RPC-ovi NE pucaju za identitet bez employments (prazno stanje);
--   (5) prima poziv → accept KREIRA članstvo + rola izvire (app_users.role postaje driver).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid();
  u_office uuid := gen_random_uuid();
  u_fl  uuid := gen_random_uuid();   -- radnik bez firme
  u_bad uuid := gen_random_uuid();   -- za constraint invarijantu
  n int; v_no text; v_no2 text; v_code text; ok boolean; v_role text; v_comp uuid;
begin
  -- ═══ FIXTURES ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_office,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_office||'@t.local'),
    (u_fl,    '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_fl||'@t.local'),
    (u_bad,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_bad||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active');
  insert into app_users (id, company_id, role, active_company_id) values (u_office, c_a, 'owner', c_a);
  insert into memberships (user_id, company_id, role, status) values (u_office, c_a, 'owner', 'active');
  -- NAPOMENA: u_fl NEMA app_users red — nastaje kroz ensure_identity().

  -- ═══ (0) CONSTRAINT invarijanta (kao superuser, pre impersonacije) ═══
  ok := false;
  begin insert into app_users (id, company_id, role) values (u_bad, null, 'driver');  -- rola bez firme
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'FAIL: role-bez-firme je prošao constraint'; end if;
  -- prazan identitet (role NULL + company NULL) je DOZVOLJEN
  insert into app_users (id, company_id, role) values (u_bad, null, null);
  select count(*) into n from app_users where id = u_bad and role is null and company_id is null;
  if n <> 1 then raise exception 'FAIL: prazan identitet nije dozvoljen'; end if;

  set local role authenticated;

  -- ═══ (1) ensure_identity IDEMPOTENTNO ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_fl)::text, true);
  perform ensure_identity();
  perform ensure_identity();   -- drugi put ne sme da duplira
  select count(*) into n from app_users where id = u_fl;
  if n <> 1 then raise exception 'FAIL: ensure_identity nije idempotentan (n=%)', n; end if;
  select count(*) into n from app_users where id = u_fl and role is null and company_id is null;
  if n <> 1 then raise exception 'FAIL: identitet nije čist (role/company nije NULL)'; end if;

  -- ═══ (2) ensure_worker_public_no('driver') → BT-D + mrežni profil ═══
  select ensure_worker_public_no('driver') into v_no;
  if v_no is null or left(v_no, 4) <> 'BT-D' then raise exception 'FAIL: BT-D nije dodeljen (%)', v_no; end if;
  select ensure_worker_public_no('driver') into v_no2;   -- idempotentno, isti broj
  if v_no2 <> v_no then raise exception 'FAIL: ponovni poziv promenio broj (% vs %)', v_no, v_no2; end if;
  select my_worker_public_no() into v_no2;
  if v_no2 <> v_no then raise exception 'FAIL: my_worker_public_no ne vraća isti broj'; end if;
  -- radnik pravi svoj mrežni profil (RLS np_self dozvoljava self insert)
  insert into network_profiles (user_id, visibility, seeking_role, countries_of_interest, languages)
    values (u_fl, 'visible', 'driver', array['DE'], array['de']);

  -- ═══ (4) career RPC-ovi ne pucaju za prazan identitet (bez employments/tura) ═══
  begin
    perform career_header(null);
    perform career_summary(null);
    perform career_km_series(null);
    perform career_employments(null);
  exception when others then
    raise exception 'FAIL: career RPC pukao za identitet bez firme (%: %)', sqlstate, sqlerrm;
  end;

  -- ═══ (3) VIDLJIV u pretrazi (office), BEZ ijedne firme, sa javnim brojem ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_office)::text, true);
  select count(*) into n from network_search() where user_id = u_fl and public_no = v_no;
  if n <> 1 then raise exception 'FAIL: radnik bez firme se ne vidi u pretrazi sa BT brojem'; end if;

  -- ═══ (5) POZIV → ACCEPT KREIRA ČLANSTVO + ROLA IZVIRE ═══
  select (network_invite(u_fl, 'driver'))->>'code' into v_code;
  if v_code is null then raise exception 'FAIL: network_invite nije vratio kod'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_fl)::text, true);
  perform accept_invitation(v_code);
  select count(*) into n from memberships where user_id = u_fl and company_id = c_a and role='driver' and status='active';
  if n <> 1 then raise exception 'FAIL: accept nije kreirao vozačko članstvo (n=%)', n; end if;
  -- identitet dobio rolu/firmu (legacy fallback sinhronizovan)
  select role::text, company_id into v_role, v_comp from app_users where id = u_fl;
  if v_role <> 'driver' or v_comp <> c_a then raise exception 'FAIL: rola/firma ne izviru posle accept (role=%, comp=%)', v_role, v_comp; end if;
  -- mrežni profil ostaje njegov, vidljivost NIJE promenjena sama
  select visibility into v_role from network_profiles where user_id = u_fl;
  if v_role <> 'visible' then raise exception 'FAIL: vidljivost mrežnog profila promenjena posle accept'; end if;

  raise exception 'ALL_FIRMLESS_TESTS_PASSED';
end $$;
