-- ─────────────────────────────────────────────────────────────────────────────
-- POZIVNICE test svita (0018: invitations + accept_invitation). Isti mehanizam kao
-- rls_audit_test: impersonacija (jwt claims + set local role authenticated) u JEDNOJ
-- transakciji koja se na kraju ROLLBACK-uje (namerni `raise` sentinel) → READ-ONLY.
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/invitations_test.sql
--   uspeh => izlaz sadrži 'ALL_INVITATIONS_TESTS_PASSED'
--   pad   => 'FAIL: …'
--
-- Pokriva: (a) happy path vozača — svež nalog (bez app_users) prihvata kod:
--              nastaju app_users(most: company_id+role), driver_profile(BT-D),
--              drivers red (bez duplikata), aktivno zaposlenje; pozivnica accepted;
--          (b) već-prihvaćena (isti korisnik, isti kod) → 'already_accepted', bez duplikata;
--          (c) istekla / otkazana / pogrešan kod → jasne greške;
--          (d) izolacija firmi (owner B ne vidi pozivnice firme A);
--          (e) suspend-gate: owner obustavljene firme NE pravi pozivnicu;
--          (f) već član DRUGE firme → INVITE_OTHER_COMPANY;
--          (g) dispečer za svež nalog (bez identiteta) → INVITE_DISPATCHER_NOT_READY.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_s uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid(); u_os uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_dfresh uuid := gen_random_uuid();   -- svež nalog (auth.users, BEZ app_users) → prihvata
  u_dfresh2 uuid := gen_random_uuid();  -- svež nalog za odbijene pokušaje
  u_dfresh3 uuid := gen_random_uuid();  -- svež nalog bez imena → fallback 'Vozač' (0019)
  u_other uuid := gen_random_uuid();    -- već vozač firme B → drugi tenant
  d_other uuid := gen_random_uuid();
  inv_ok uuid; code_ok text;
  inv_other uuid; code_other text;
  inv_exp uuid; code_exp text;
  inv_can uuid; code_can text;
  inv_disp uuid; code_disp text;
  inv_noname uuid; code_noname text;
  n int; v_result jsonb; v_txt text; v_err text; ok boolean;
begin
  -- ═══ FIXTURES (kao postgres, bypass RLS) ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_oa,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local'),
    (u_os,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_os||'@t.local'),
    (u_admin,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_admin||'@t.local'),
    (u_dfresh,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_dfresh||'@t.local'),
    (u_dfresh2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_dfresh2||'@t.local'),
    (u_dfresh3,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_dfresh3||'@t.local'),
    (u_other,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_other||'@t.local');
  insert into companies (id, name, status) values
    (c_a,'A','active'), (c_b,'B','active'), (c_s,'S','suspended');
  insert into app_users (id, company_id, role) values
    (u_oa, c_a,'owner'), (u_ob, c_b,'owner'), (u_os, c_s,'owner'),
    (u_admin, null,'platform_admin'), (u_other, c_b,'driver');
  insert into drivers (id, company_id, user_id, full_name) values (d_other, c_b, u_other, 'Other Drv');
  -- NAPOMENA: u_dfresh / u_dfresh2 NEMAJU app_users red (to je „nalog nije povezan sa firmom").

  -- ═══ Owner A pravi pozivnice (impersonacija) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  set local role authenticated;

  insert into invitations (company_id, created_by, role, invited_name)
    values (c_a, u_oa, 'driver', 'Novi Vozač') returning id, code into inv_ok, code_ok;
  insert into invitations (company_id, created_by, role)
    values (c_a, u_oa, 'driver') returning id, code into inv_other;
  select code into code_other from invitations where id = inv_other;
  insert into invitations (company_id, created_by, role)
    values (c_a, u_oa, 'driver') returning id, code into inv_exp;
  select code into code_exp from invitations where id = inv_exp;
  insert into invitations (company_id, created_by, role)
    values (c_a, u_oa, 'driver') returning id, code into inv_can;
  select code into code_can from invitations where id = inv_can;
  insert into invitations (company_id, created_by, role)
    values (c_a, u_oa, 'dispatcher') returning id, code into inv_disp;
  select code into code_disp from invitations where id = inv_disp;
  insert into invitations (company_id, created_by, role)  -- BEZ invited_name → fallback 'Vozač'
    values (c_a, u_oa, 'driver') returning id, code into inv_noname;
  select code into code_noname from invitations where id = inv_noname;

  -- kod je 8 znakova iz alfabeta bez O/0/I/1
  if code_ok !~ '^[2-9A-HJ-NP-Z]{8}$' then raise exception 'FAIL: kod pogrešan format (%)', code_ok; end if;
  if code_ok = code_other then raise exception 'FAIL: dve pozivnice dobile isti kod'; end if;

  -- fabrikacija stanja kroz owner update politiku (owner sme svoju firmu)
  update invitations set expires_at = now() - interval '1 day' where id = inv_exp;
  update invitations set status = 'cancelled' where id = inv_can;

  -- ═══ (d) IZOLACIJA: owner B ne vidi pozivnice firme A ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_ob)::text, true);
  select count(*) into n from invitations where company_id = c_a;
  if n <> 0 then raise exception 'FAIL: owner B vidi pozivnice firme A (%)', n; end if;
  select count(*) into n from invitations;  -- firma B nema pozivnica
  if n <> 0 then raise exception 'FAIL: owner B vidi tuđe pozivnice (% ukupno)', n; end if;

  -- ═══ (e) SUSPEND-GATE: owner obustavljene firme NE pravi pozivnicu ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_os)::text, true);
  ok := false;
  begin
    insert into invitations (company_id, created_by, role) values (c_s, u_os, 'driver');
  exception when others then ok := true;  -- očekivano: restrictive suspend-gate
  end;
  if not ok then raise exception 'FAIL: pozivnica u OBUSTAVLJENU firmu NIJE blokirana'; end if;

  -- ═══ (f) VEĆ ČLAN DRUGE FIRME → odbij ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_other)::text, true);
  begin
    v_result := accept_invitation(code_other); v_err := 'NONE';
  exception when others then v_err := SQLERRM;
  end;
  if v_err not like '%INVITE_OTHER_COMPANY%' then
    raise exception 'FAIL: član firme B prihvatio pozivnicu firme A (err=%)', v_err;
  end if;

  -- ═══ (a) HAPPY PATH VOZAČA: svež nalog prihvata kod ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_dfresh)::text, true);
  v_result := accept_invitation(code_ok);
  if v_result->>'status' <> 'accepted' then raise exception 'FAIL: happy path status=%', v_result->>'status'; end if;
  if v_result->>'company_id' <> c_a::text then raise exception 'FAIL: happy path pogrešna firma'; end if;

  -- app_users nastao (most: company_id + role driver) — vozač čita svoj red
  select count(*) into n from app_users where id = u_dfresh and company_id = c_a and role = 'driver';
  if n <> 1 then raise exception 'FAIL: most — app_users vozača nije postavljen (company/role)'; end if;
  -- driver_profile nastao (BT-D), display_name iz invited_name pozivnice (0019)
  select count(*) into n from driver_profiles where user_id = u_dfresh and public_no ~ '^BT-D-\d{5,}$';
  if n <> 1 then raise exception 'FAIL: driver_profile (BT-D) nije nastao'; end if;
  select display_name into v_txt from driver_profiles where user_id = u_dfresh;
  if v_txt <> 'Novi Vozač' then raise exception 'FAIL: display_name nije invited_name (%)', v_txt; end if;
  -- aktivno zaposlenje u firmi A
  select count(*) into n from employments where user_id = u_dfresh and company_id = c_a and status = 'active' and role_on_company = 'driver';
  if n <> 1 then raise exception 'FAIL: aktivno zaposlenje nije nastalo'; end if;

  -- ═══ (b) VEĆ-PRIHVAĆENA: isti korisnik, isti kod → already_accepted, bez duplikata ═══
  v_result := accept_invitation(code_ok);
  if v_result->>'status' <> 'already_accepted' then
    raise exception 'FAIL: ponovni poziv nije already_accepted (%)', v_result->>'status';
  end if;
  select count(*) into n from employments where user_id = u_dfresh and company_id = c_a and status = 'active';
  if n <> 1 then raise exception 'FAIL: dupli zaposlenje red posle ponovnog prihvatanja (%)', n; end if;

  -- drivers red (bez duplikata — lekcija blizanaca); čita owner A (RLS drivers_tenant)
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select count(*) into n from drivers where company_id = c_a and user_id = u_dfresh;
  if n <> 1 then raise exception 'FAIL: drivers red vozača nije tačno jedan (%)', n; end if;
  -- pozivnica označena accepted, accepted_by = vozač
  select count(*) into n from invitations where id = inv_ok and status = 'accepted' and accepted_by = u_dfresh;
  if n <> 1 then raise exception 'FAIL: pozivnica nije accepted/accepted_by'; end if;

  -- ═══ (c) ISTEKLA / OTKAZANA / POGREŠAN / DISPEČER-NIJE-SPREMAN (svež nalog 2) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_dfresh2)::text, true);

  begin v_result := accept_invitation(code_exp); v_err := 'NONE';
  exception when others then v_err := SQLERRM; end;
  if v_err not like '%INVITE_EXPIRED%' then raise exception 'FAIL: istekla nije odbijena (err=%)', v_err; end if;

  begin v_result := accept_invitation(code_can); v_err := 'NONE';
  exception when others then v_err := SQLERRM; end;
  if v_err not like '%INVITE_CANCELLED%' then raise exception 'FAIL: otkazana nije odbijena (err=%)', v_err; end if;

  begin v_result := accept_invitation('ZZZZZZZZ'); v_err := 'NONE';
  exception when others then v_err := SQLERRM; end;
  if v_err not like '%INVITE_NOT_FOUND%' then raise exception 'FAIL: pogrešan kod nije odbijen (err=%)', v_err; end if;

  begin v_result := accept_invitation(code_disp); v_err := 'NONE';
  exception when others then v_err := SQLERRM; end;
  if v_err not like '%INVITE_DISPATCHER_NOT_READY%' then
    raise exception 'FAIL: dispečer za svež nalog nije odbijen (err=%)', v_err;
  end if;

  -- svež nalog 2 je posle svih odbijenih pokušaja OSTAO bez firme/reda
  select count(*) into n from app_users where id = u_dfresh2;
  if n <> 0 then raise exception 'FAIL: odbijeni pokušaji ipak napravili app_users'; end if;

  -- ═══ (0019) FALLBACK IMENA: pozivnica bez invited_name → display_name = 'Vozač' ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_dfresh3)::text, true);
  v_result := accept_invitation(code_noname);
  if v_result->>'status' <> 'accepted' then raise exception 'FAIL: no-name accept nije prošao'; end if;
  select display_name into v_txt from driver_profiles where user_id = u_dfresh3;
  if v_txt <> 'Vozač' then raise exception 'FAIL: fallback ime nije Vozač (%)', v_txt; end if;
  -- i drivers.full_name je 'Vozač' (ne NULL, ne imejl)
  perform set_config('request.jwt.claims', json_build_object('sub', u_oa)::text, true);
  select full_name into v_txt from drivers where user_id = u_dfresh3 and company_id = c_a;
  if v_txt <> 'Vozač' then raise exception 'FAIL: drivers.full_name fallback nije Vozač (%)', v_txt; end if;

  -- Sve prošlo → namerni rollback (read-only).
  raise exception 'ALL_INVITATIONS_TESTS_PASSED';
end $$;
