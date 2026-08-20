-- ─────────────────────────────────────────────────────────────────────────────
-- SAMOUSLUŽNO OTVARANJE FIRME + ŠIFARNICI test svita (0025). Impersonacija, ROLLBACK.
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/company_self_test.sql
--   uspeh => 'ALL_COMPANY_SELF_TESTS_PASSED'; pad => 'FAIL: …'
--
-- Pokriva: create_company_self — NoRole korisnik uspeva (firma+owner+invoice_settings);
--   korisnik SA firmom odbijen; izolacija nove firme od postojećih; countries/vehicle_types
--   čitljivi svima / klijentski write odbijen.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_x uuid := gen_random_uuid();
  u_new uuid := gen_random_uuid();       -- NoRole (auth.users, BEZ app_users)
  u_exist uuid := gen_random_uuid();      -- već vlasnik firme c_x
  v_c uuid; n int; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_new,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_new||'@t.local'),
    (u_exist,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_exist||'@t.local');
  insert into companies (id, name, status) values (c_x, 'Postojeća', 'active');
  insert into app_users (id, company_id, role) values (u_exist, c_x, 'owner');

  set local role authenticated;

  -- ═══ NoRole korisnik OTVARA firmu ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_new)::text, true);
  select create_company_self('Nova Firma', 'rs', 'RSD') into v_c;
  if v_c is null then raise exception 'FAIL: create_company_self nije vratio company_id'; end if;

  -- firma (starter/limit 5/active, zemlja RS, valuta RSD) — vlasnik čita svoju
  select count(*) into n from companies
    where id = v_c and name = 'Nova Firma' and country_code = 'RS' and base_currency = 'RSD'
      and plan = 'starter' and vehicle_limit = 5 and status = 'active';
  if n <> 1 then raise exception 'FAIL: firma nije ispravno kreirana'; end if;
  -- app_users owner
  select count(*) into n from app_users where id = u_new and company_id = v_c and role = 'owner';
  if n <> 1 then raise exception 'FAIL: owner red nije kreiran'; end if;
  -- prazan invoice_settings
  select count(*) into n from invoice_settings where company_id = v_c;
  if n <> 1 then raise exception 'FAIL: invoice_settings nije kreiran'; end if;

  -- ═══ Isti korisnik (sada IMA firmu) → odbijen ═══
  ok := false;
  begin
    perform create_company_self('Druga', 'RS', 'EUR');
  exception when others then ok := true;  -- očekivano: SELF_ALREADY_HAS_COMPANY
  end;
  if not ok then raise exception 'FAIL: korisnik sa firmom mogao da otvori još jednu'; end if;

  -- ═══ IZOLACIJA: postojeći vlasnik ne vidi novu firmu; novi ne vidi postojeću ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_exist)::text, true);
  select count(*) into n from companies where id = v_c;
  if n <> 0 then raise exception 'FAIL: postojeći vlasnik vidi novu firmu'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_new)::text, true);
  select count(*) into n from companies where id = c_x;
  if n <> 0 then raise exception 'FAIL: novi vlasnik vidi tuđu firmu'; end if;

  -- ═══ ŠIFARNICI čitljivi svima / write odbijen ═══
  select count(*) into n from countries;
  if n <> 41 then raise exception 'FAIL: countries seed (%, očekivano 41)', n; end if;
  select count(*) into n from vehicle_types;
  if n <> 9 then raise exception 'FAIL: vehicle_types seed (%, očekivano 9)', n; end if;
  ok := false;
  begin
    insert into countries (code, name_key) values ('ZZ','x');
  exception when others then ok := true;
  end;
  if not ok then raise exception 'FAIL: klijent upisao u countries'; end if;

  raise exception 'ALL_COMPANY_SELF_TESTS_PASSED';
end $$;
