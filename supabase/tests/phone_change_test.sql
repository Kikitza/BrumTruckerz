-- ─────────────────────────────────────────────────────────────────────────────
-- KAPIJA F1 — „broj je BRAVA, ne identitet". Dokaz: promena auth telefona NE dira
-- identitet vozača (BT-D broj, zaposlenje, drivers red, dodeljene ture). Read-mostly
-- (jedan UPDATE nad auth.users.phone), sve u transakciji koja se ROLLBACK-uje (sentinel).
--
-- Pokretanje:  supabase db query --linked -f supabase/tests/phone_change_test.sql
--   uspeh => 'ALL_PHONE_CHANGE_TESTS_PASSED'; pad => 'FAIL: …'
--
-- GoTrue nalazi korisnika PO TELEFONU (auth.users.phone je lokator = brava). Ceo identitet
-- (app_users.id, driver_profile.public_no, employments, drivers, trips.driver_id) visi o
-- user_id, NE o broju. Zato posle rotacije broja: stari broj → nema korisnika („ne prolazi"),
-- novi → ISTI id („prolazi"), a identitet ostaje netaknut.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid();
  u   uuid := gen_random_uuid();          -- vozač (telefon-identitet)
  d   uuid := gen_random_uuid();          -- drivers red
  v   uuid := gen_random_uuid();          -- vozilo
  tr  uuid := gen_random_uuid();          -- tura dodeljena vozaču
  emp uuid;
  v_old text := '+3816' || lpad((floor(random()*90000000)::int + 10000000)::text, 8, '0');
  v_new text := '+3817' || lpad((floor(random()*90000000)::int + 10000000)::text, 8, '0');
  no_before text; no_after text; n int;
begin
  -- ═══ FIXTURES: vozač sa telefon-identitetom + pun identitet-graf ═══
  insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_old, now());
  insert into companies (id, name, status) values (c_a, 'A', 'active');
  insert into app_users (id, company_id, role, full_name) values (u, c_a, 'driver', 'Telefon Vozač');
  insert into driver_profiles (user_id, display_name) values (u, 'Telefon Vozač');   -- BT-D kroz default
  insert into employments (company_id, user_id, role_on_company, status)
    values (c_a, u, 'driver', 'active') returning id into emp;
  insert into drivers (id, company_id, user_id, full_name) values (d, c_a, u, 'Telefon Vozač');
  insert into vehicles (id, company_id, registration) values (v, c_a, 'A-1');
  insert into trips (id, company_id, driver_id, vehicle_id, status) values (tr, c_a, d, v, 'driving');

  select public_no into no_before from driver_profiles where user_id = u;
  if no_before !~ '^BT-D-\d{5,}$' then raise exception 'FAIL: nema BT-D broja pre promene'; end if;

  -- ═══ ROTACIJA BRAVE: promeni auth telefon (ono što verifyOtp 'phone_change' radi) ═══
  update auth.users set phone = v_new, phone_confirmed_at = now() where id = u;

  -- ═══ BRAVA: stari broj više NE prolazi, novi prolazi — i to je ISTI identitet ═══
  select count(*) into n from auth.users where phone = v_old;
  if n <> 0 then raise exception 'FAIL: stari broj i dalje postoji (ne bi trebalo)'; end if;
  select count(*) into n from auth.users where phone = v_new and id = u;
  if n <> 1 then raise exception 'FAIL: novi broj ne vodi na ISTI identitet'; end if;

  -- ═══ IDENTITET NETAKNUT: BT-D broj isti ═══
  select public_no into no_after from driver_profiles where user_id = u;
  if no_after is distinct from no_before then
    raise exception 'FAIL: BT-D broj se promenio (% -> %)', no_before, no_after;
  end if;

  -- zaposlenje: isti red, i dalje aktivno
  select count(*) into n from employments where id = emp and user_id = u and company_id = c_a and status = 'active';
  if n <> 1 then raise exception 'FAIL: zaposlenje se promenilo'; end if;

  -- drivers red: ista veza (user_id = u)
  select count(*) into n from drivers where id = d and user_id = u and company_id = c_a;
  if n <> 1 then raise exception 'FAIL: drivers red se promenio'; end if;

  -- dodeljena tura: i dalje na istom vozaču
  select count(*) into n from trips where id = tr and driver_id = d and company_id = c_a;
  if n <> 1 then raise exception 'FAIL: dodela ture se promenila'; end if;

  raise exception 'ALL_PHONE_CHANGE_TESTS_PASSED';
end $$;
