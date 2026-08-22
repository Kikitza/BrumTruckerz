-- ─────────────────────────────────────────────────────────────────────────────
-- Članstva (v2-3 kriška 1) test svita. Impersonacija + rollback (sentinel), read-only.
-- Pokriva ADR 0013:
--   (1) helper čita AKTIVNO članstvo; PREKIDAČ menja vidljivi svet (A→B), izolacija;
--   (2) set_active_company u firmu bez članstva → 42501;
--   (3) drugo aktivno VOZAČKO članstvo ODBIJENO (accept → INVITE_DRIVER_ALREADY_ENGAGED);
--   (4) OFFICE (dispatcher) multi-firma DOZVOLJENO; accept KREIRA članstvo.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid(); c_b uuid := gen_random_uuid(); c_c uuid := gen_random_uuid();
  u_multi uuid := gen_random_uuid(); u_drv uuid := gen_random_uuid(); u_new uuid := gen_random_uuid();
  u_oa uuid := gen_random_uuid(); u_ob uuid := gen_random_uuid();
  d_drv uuid := gen_random_uuid();
  n int; v_comp uuid; v_role text; ok boolean;
begin
  -- ═══ FIXTURES ═══
  insert into auth.users (id, instance_id, aud, role, email) values
    (u_multi,'00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_multi||'@t.local'),
    (u_drv,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_drv||'@t.local'),
    (u_new,  '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_new||'@t.local'),
    (u_oa,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_oa||'@t.local'),
    (u_ob,   '00000000-0000-0000-0000-000000000000','authenticated','authenticated', u_ob||'@t.local');
  insert into companies (id, name, status) values (c_a,'A','active'), (c_b,'B','active'), (c_c,'C','active');
  insert into app_users (id, company_id, role, active_company_id) values
    (u_oa, c_a, 'owner', c_a), (u_ob, c_b, 'owner', c_b),
    (u_multi, c_a, 'dispatcher', c_a),          -- dispečer u OBE firme (office multi)
    (u_drv, c_a, 'driver', c_a);
  insert into drivers (id, company_id, user_id, full_name) values (d_drv, c_a, u_drv, 'DRV');
  -- Članstva (kao posle backfill-a): u_multi u A i B (dispatcher); u_drv u A (driver); owneri.
  insert into memberships (user_id, company_id, role, status) values
    (u_oa, c_a, 'owner', 'active'), (u_ob, c_b, 'owner', 'active'),
    (u_multi, c_a, 'dispatcher', 'active'), (u_multi, c_b, 'dispatcher', 'active'),
    (u_drv, c_a, 'driver', 'active');
  -- Podaci po firmi (za dokaz izolacije kroz prekidač).
  insert into customers (company_id, name) values (c_a, 'Cust A'), (c_b, 'Cust B');
  -- Pozivnice (created_by = owner te firme).
  insert into invitations (company_id, role, code, created_by) values
    (c_b, 'driver',     'DRIVERBB', u_ob),
    (c_b, 'dispatcher', 'DISPBBBB', u_ob),
    (c_a, 'dispatcher', 'DISPAAAA', u_oa);

  set local role authenticated;

  -- ═══ (1) HELPER čita aktivno članstvo + PREKIDAČ menja vidljivi svet ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_multi)::text, true);
  select current_company_id(), current_role_name()::text into v_comp, v_role;
  if v_comp <> c_a then raise exception 'FAIL: aktivna firma = % (očekivano A)', v_comp; end if;
  if v_role <> 'dispatcher' then raise exception 'FAIL: aktivna rola = % (očekivano dispatcher)', v_role; end if;
  if not is_office_role() then raise exception 'FAIL: is_office_role false za dispečera'; end if;
  select count(*) into n from customers;  -- RLS office → samo aktivna firma (A)
  if n <> 1 then raise exception 'FAIL: u firmi A vidi % naručilaca (očekivano 1)', n; end if;
  select count(*) into n from customers where name = 'Cust A';
  if n <> 1 then raise exception 'FAIL: u firmi A ne vidi Cust A'; end if;

  -- PREBACI na B → svet se menja (vidi B, NE vidi A)
  perform set_active_company(c_b);
  if current_company_id() <> c_b then raise exception 'FAIL: prekidač nije postavio B'; end if;
  select count(*) into n from customers;
  if n <> 1 then raise exception 'FAIL: u firmi B vidi % naručilaca (očekivano 1)', n; end if;
  select count(*) into n from customers where name = 'Cust A';
  if n <> 0 then raise exception 'FAIL: u firmi B i dalje vidi Cust A (izolacija pukla)'; end if;

  -- ═══ (2) set_active_company u firmu BEZ članstva → 42501 ═══
  ok := false;
  begin perform set_active_company(c_c);
  exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: set_active_company u firmu bez članstva nije odbijen'; end if;

  -- ═══ (3) drugo aktivno VOZAČKO članstvo ODBIJENO (accept) ═══
  perform set_config('request.jwt.claims', json_build_object('sub', u_drv)::text, true);
  ok := false;
  begin perform accept_invitation('DRIVERBB');   -- vozačka pozivnica za c_b; već vozač u c_a
  exception when others then ok := (sqlstate = '42501'); end;
  if not ok then raise exception 'FAIL: drugo aktivno vozačko članstvo nije odbijeno'; end if;
  -- i dalje samo JEDNO vozačko članstvo
  select count(*) into n from memberships where user_id = u_drv and role='driver' and status='active';
  if n <> 1 then raise exception 'FAIL: u_drv ima % aktivnih vozačkih članstava (očekivano 1)', n; end if;

  -- ═══ (4) OFFICE multi + accept KREIRA članstvo ═══
  -- u_multi već ima 2 aktivna dispečerska članstva (fixture) → office multi dozvoljen
  perform set_config('request.jwt.claims', json_build_object('sub', u_multi)::text, true);
  select count(*) into n from memberships where user_id = u_multi and status='active';
  if n <> 2 then raise exception 'FAIL: office multi — u_multi ima % članstava (očekivano 2)', n; end if;

  -- nov korisnik prihvata dispečersku pozivnicu → app_users + članstvo nastaju
  perform set_config('request.jwt.claims', json_build_object('sub', u_new)::text, true);
  perform accept_invitation('DISPBBBB');   -- dispatcher c_b
  select count(*) into n from memberships where user_id = u_new and company_id = c_b and status='active';
  if n <> 1 then raise exception 'FAIL: accept nije kreirao članstvo (u_new@B) = %', n; end if;
  -- isti nov korisnik prihvata dispečersku pozivnicu DRUGE firme → office multi (2 članstva)
  perform accept_invitation('DISPAAAA');   -- dispatcher c_a
  select count(*) into n from memberships where user_id = u_new and status='active';
  if n <> 2 then raise exception 'FAIL: office multi kroz accept — u_new ima % članstava (očekivano 2)', n; end if;

  raise exception 'ALL_MEMBERSHIPS_TESTS_PASSED';
end $$;
