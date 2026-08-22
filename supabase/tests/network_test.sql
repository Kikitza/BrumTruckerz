-- ─────────────────────────────────────────────────────────────────────────────
-- MREŽNI PROFIL (v2-3 kriška 2, ADR 0014) test svita. Impersonacija + rollback
-- (sentinel), read-only. Pokriva:
--   (1) PRIVATAN profil NEVIDLJIV u pretrazi; VIDLJIV se pojavljuje (BEZ PII — samo javni broj);
--   (2) filteri (uloga/zemlja/jezik) rade;
--   (3) radnik menja SAMO svoj profil (RLS np_self);
--   (4) office NE čita tabelu direktno (pretraga samo kroz RPC);
--   (5) ne-office pozivalac network_search → NOT_OFFICE (42501);
--   (6) poziv (network_invite) → accept KREIRA članstvo;
--   (7) već angažovan vozač (drugo aktivno vozačko) → INVITE_DRIVER_ALREADY_ENGAGED (42501).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid();   -- firma koja pretražuje/poziva
  c_b uuid := gen_random_uuid();   -- firma u kojoj je „već angažovan" vozač
  u_office uuid := gen_random_uuid();
  u_vis    uuid := gen_random_uuid();  -- vidljiv radnik (traži vozača)
  u_priv   uuid := gen_random_uuid();  -- privatan radnik
  u_new    uuid := gen_random_uuid();  -- slobodan radnik (bez aktivnog članstva)
  u_eng    uuid := gen_random_uuid();  -- već aktivan vozač u c_b
  d_eng    uuid := gen_random_uuid();
  n int; v_no text; v_code text; ok boolean; v_rows int;
begin
  -- ═══ FIXTURES ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_office,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_office||'@t.local'),
    (u_vis,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_vis||'@t.local'),
    (u_priv,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_priv||'@t.local'),
    (u_new,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_new||'@t.local'),
    (u_eng,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_eng||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active');
  -- Radnik-vozač UVEK ima firmu (constraint app_users_company_by_role). Zaposleni vozači
  -- mogu biti „vidljivi" tržištu; „na tržištu" = ZAVRŠENO članstvo (bez aktivnog vozačkog).
  insert into app_users (id, company_id, role, active_company_id, full_name) values
    (u_office, c_a, 'owner',  c_a,  'Office A'),
    (u_vis,    c_b, 'driver', c_b,  'Vozac Vidljivi'),   -- zaposlen u B, ali vidljiv
    (u_priv,   c_b, 'driver', c_b,  'Vozac Privatni'),
    (u_new,    c_b, 'driver', null, 'Vozac Novi'),       -- napustio B (članstvo ended) → na tržištu
    (u_eng,    c_b, 'driver', c_b,  'Vozac Angazovani'); -- aktivno vozačko u B
  insert into memberships (user_id, company_id, role, status, ended_at) values
    (u_office, c_a, 'owner',  'active', null),
    (u_vis,    c_b, 'driver', 'active', null),
    (u_priv,   c_b, 'driver', 'active', null),
    (u_new,    c_b, 'driver', 'ended',  now()),   -- nema aktivnog vozačkog → accept prolazi
    (u_eng,    c_b, 'driver', 'active', null);     -- već angažovan → accept odbijen
  insert into drivers (id, company_id, user_id, full_name) values (d_eng, c_b, u_eng, 'Vozac Angazovani');
  -- Javni broj za vidljivog (kartica vraća coalesce(driver/dispatcher public_no)).
  insert into driver_profiles (user_id, display_name) values (u_vis, 'Vozac Vidljivi');
  select public_no into v_no from driver_profiles where user_id = u_vis;

  -- Mrežni profili: vidljiv (DE/de) i privatan.
  insert into network_profiles (user_id, visibility, seeking_role, countries_of_interest, languages) values
    (u_vis,  'visible', 'driver', array['DE'], array['de']),
    (u_priv, 'private', 'driver', array['DE'], array['de']);

  set local role authenticated;

  -- ═══ (1) PRETRAGA: vidljiv se pojavljuje (sa javnim brojem), privatan NE ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_office)::text, true);
  select count(*) into n from network_search() where user_id = u_vis;
  if n <> 1 then raise exception 'FAIL: vidljiv radnik se ne pojavljuje u pretrazi (n=%)', n; end if;
  select count(*) into n from network_search() where user_id = u_priv;
  if n <> 0 then raise exception 'FAIL: PRIVATAN radnik se pojavljuje u pretrazi'; end if;
  -- Kartica nosi javni broj (BT-D), a NE ime (funkcija ne vraća PII kolonu).
  select count(*) into n from network_search() where user_id = u_vis and public_no = v_no;
  if n <> 1 then raise exception 'FAIL: kartica ne nosi očekivani javni broj %', v_no; end if;

  -- ═══ (2) FILTERI: uloga/zemlja/jezik ═══
  select count(*) into n from network_search('driver', 'DE', 'de', false, 50, 0) where user_id = u_vis;
  if n <> 1 then raise exception 'FAIL: filter (driver/DE/de) ne vraća vidljivog'; end if;
  select count(*) into n from network_search('driver', 'FR', null, false, 50, 0) where user_id = u_vis;
  if n <> 0 then raise exception 'FAIL: filter zemlje (FR) i dalje vraća DE-radnika'; end if;
  select count(*) into n from network_search('dispatcher', null, null, false, 50, 0) where user_id = u_vis;
  if n <> 0 then raise exception 'FAIL: filter uloge (dispatcher) vraća vozača'; end if;

  -- ═══ (4) OFFICE NE čita tabelu direktno (RLS: nema politike za office) ═══
  select count(*) into n from network_profiles;   -- office nema svoj profil → 0
  if n <> 0 then raise exception 'FAIL: office čita network_profiles direktno (n=%)', n; end if;

  -- ═══ (3) RADNIK menja SAMO svoj profil ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_vis)::text, true);
  select count(*) into n from network_profiles;   -- vidi samo svoj (np_self)
  if n <> 1 then raise exception 'FAIL: radnik vidi % profila (očekivano samo svoj)', n; end if;
  -- Pokušaj izmene TUĐEG (u_priv) → 0 redova (RLS using filter), tuđi profil netaknut.
  update network_profiles set note = 'hack' where user_id = u_priv;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: radnik je izmenio TUĐI profil (rows=%)', v_rows; end if;
  -- Izmena SVOG profila prolazi.
  update network_profiles set note = 'moje' where user_id = u_vis;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL: radnik ne može da izmeni svoj profil (rows=%)', v_rows; end if;

  -- ═══ (5) NE-OFFICE pozivalac network_search → NOT_OFFICE (42501) ═══
  ok := false;
  begin perform network_search();
  exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: ne-office pozivalac nije odbijen (NOT_OFFICE)'; end if;

  -- ═══ (6) POZIV → ACCEPT KREIRA ČLANSTVO ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_office)::text, true);
  select (network_invite(u_new, 'driver'))->>'code' into v_code;
  if v_code is null then raise exception 'FAIL: network_invite nije vratio kod'; end if;
  -- Radnik vidi poziv u svojoj listi.
  perform set_config('request.jwt.claims', json_build_object('sub', u_new)::text, true);
  select count(*) into n from my_network_invites() where company_id = c_a;
  if n <> 1 then raise exception 'FAIL: radnik ne vidi upućeni poziv (n=%)', n; end if;
  -- Prihvatanje kroz ISTU kapiju → članstvo u c_a.
  perform accept_invitation(v_code);
  select count(*) into n from memberships where user_id = u_new and company_id = c_a and status='active';
  if n <> 1 then raise exception 'FAIL: accept nije kreirao članstvo (u_new@A) = %', n; end if;

  -- ═══ (7) VEĆ ANGAŽOVAN VOZAČ → INVITE_DRIVER_ALREADY_ENGAGED (42501) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_office)::text, true);
  select (network_invite(u_eng, 'driver'))->>'code' into v_code;
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng)::text, true);
  ok := false;
  begin perform accept_invitation(v_code);   -- već aktivan vozač u c_b
  exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: već angažovan vozač nije odbijen'; end if;
  -- I dalje samo JEDNO aktivno vozačko članstvo.
  select count(*) into n from memberships where user_id = u_eng and role='driver' and status='active';
  if n <> 1 then raise exception 'FAIL: u_eng ima % aktivnih vozačkih članstava (očekivano 1)', n; end if;

  raise exception 'ALL_NETWORK_TESTS_PASSED';
end $$;
