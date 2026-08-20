-- ─────────────────────────────────────────────────────────────────────────────
-- STAGING SEED (test izdržljivosti, F3). SAMO STAGING (webquovijioxmouvuiko). PROD/DEV NE.
-- IDEMPOTENTNO: prvo briše prethodni [SEED] (firma se briše → CASCADE na sve), pa pravi nov.
-- SVE nosi „[SEED]" (naziv/note) → čišćenje po oznaci.
--
-- Pokretanje (staging linkovan):  supabase db query --linked -f supabase/STAGING-SEED.sql
-- Čišćenje:                       delete from companies where name like '[SEED]%';
--                                 delete from auth.users where email like '%@brumtruckerz.seed';
--
-- Volumen: 30 naručilaca, 20 vozila, 15 prikolica, 10 vozača, ~1200 tura (12 meseci; mix
-- aktivne/završene), ~40 događaja/turi (~48k), ~4 troška/turi (~4800), ~300 faktura (mix
-- statusa), rokovi po vozilima (datum + km).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  v_cust uuid[]; v_veh uuid[]; v_tra uuid[]; v_drv uuid[];
  n_trips int; n_events int; n_exp int; n_inv int; n_rem int;
begin
  -- ── Čišćenje prethodnog seed-a (idempotentno) ──
  delete from companies where name like '[SEED]%';
  delete from auth.users where email like '%@brumtruckerz.seed';

  -- ── Firma + vlasnik (visok vehicle_limit da trigger ne blokira 20 vozila) ──
  insert into auth.users (id, instance_id, aud, role, email)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seed-owner@brumtruckerz.seed');
  insert into companies (id, name, base_currency, country_code, vehicle_limit)
    values (c, '[SEED] Volume Co', 'EUR', 'RS', 100000);
  insert into app_users (id, company_id, role, full_name) values (u, c, 'owner', '[SEED] Owner');
  insert into invoice_settings (company_id, legal_name, tax_id, bank_account, prefix)
    values (c, '[SEED] Volume Co d.o.o.', 'RS100000000', 'RS00000000000000000000', '[SEED]-');

  -- ── Naručioci / flota ──
  insert into customers (company_id, name, vat_number, country_code, payment_terms_days, note)
    select c, '[SEED] Kupac '||g, 'RS'||lpad(g::text, 7, '0'), 'RS', (array[15,30,45,60])[1+floor(random()*4)::int], '[SEED]'
    from generate_series(1, 30) g;
  insert into vehicles (company_id, registration, make_model, current_odometer)
    select c, '[SEED]-V-'||g, '[SEED] model', (50000 + floor(random()*300000))::int from generate_series(1, 20) g;
  insert into trailers (company_id, registration, type)
    select c, '[SEED]-T-'||g, '[SEED]' from generate_series(1, 15) g;
  insert into drivers (company_id, full_name) select c, '[SEED] Vozač '||g from generate_series(1, 10) g;

  select array_agg(id) into v_cust from customers where company_id = c;
  select array_agg(id) into v_veh  from vehicles  where company_id = c;
  select array_agg(id) into v_tra  from trailers  where company_id = c;
  select array_agg(id) into v_drv  from drivers   where company_id = c;

  -- ── ~1200 tura kroz 12 meseci (mix statusa) ──
  insert into trips (company_id, driver_id, vehicle_id, trailer_id, customer_id, origin, destination, title, status, revenue, start_odometer, end_odometer, created_at, finished_at)
  select c,
    v_drv[1 + floor(random()*array_length(v_drv,1))::int],
    v_veh[1 + floor(random()*array_length(v_veh,1))::int],
    case when random() < 0.8 then v_tra[1 + floor(random()*array_length(v_tra,1))::int] else null end,
    v_cust[1 + floor(random()*array_length(v_cust,1))::int],
    '[SEED] Grad '||(1 + floor(random()*20))::int, '[SEED] Grad '||(1 + floor(random()*20))::int,
    '[SEED] tura '||g,
    st.status,
    round((500 + random()*4000)::numeric, 2),
    od.fl, od.fl + (100 + floor(random()*2000))::int,
    now() - (floor(random()*365)||' days')::interval,
    case when st.status = 'finished' then now() - (floor(random()*300)||' days')::interval else null end
  from generate_series(1, 1200) g
    cross join lateral (select (case when random() < 0.7 then 'finished'
                                     else (array['draft','loading','driving','border','unloading'])[1+floor(random()*5)::int] end)::trip_status status) st
    cross join lateral (select (1000 + floor(random()*500000))::int fl) od;

  -- ── ~40 događaja po turi (~48k) ──
  insert into trip_events (company_id, trip_id, type, occurred_at, note, km)
  select c, t.id,
    (array['load','unload','border','driving','rest','other','departure','stop_arrival'])[1+floor(random()*8)::int]::event_type,
    t.created_at + (floor(random()*7)||' days')::interval,
    '[SEED]',
    case when random() < 0.5 then (1000 + floor(random()*400000))::numeric else null end
  from trips t cross join generate_series(1, 40) g
  where t.company_id = c;

  -- ── ~4 troška po turi ──
  insert into expenses (company_id, trip_id, category, original_amount, original_currency, base_amount, base_currency, occurred_at, note)
  select c, t.id, ec.cat, a.amount, 'EUR', a.amount, 'EUR', t.created_at + (floor(random()*5)||' days')::interval, '[SEED]'
  from trips t
    cross join generate_series(1, 4) g
    cross join lateral (select (array['fuel','toll','customs','forwarding','parking','other'])[1+floor(random()*6)::int]::expense_category cat) ec
    cross join lateral (select round((20 + random()*500)::numeric, 2) amount) a
  where t.company_id = c;

  -- ── ~300 faktura (mix statusa) ──
  insert into invoices (company_id, customer_id, trip_id, invoice_no, issue_date, due_date, currency, amount, vat_rate, vat_amount, total, status, note, created_by)
  select c, t.customer_id, t.id, '[SEED]-'||lpad(t.rn::text, 4, '0'),
    (current_date - floor(random()*300)::int), (current_date - floor(random()*300)::int + 30),
    'EUR', t.revenue, 20, round(t.revenue*0.2, 2), round(t.revenue*1.2, 2),
    (array['issued','paid','cancelled'])[1+floor(random()*3)::int], '[SEED]', u
  from (select id, customer_id, revenue, row_number() over (order by created_at desc) rn
          from trips where company_id = c and customer_id is not null and revenue is not null limit 300) t;

  -- ── Rokovi po vozilima (datum + km) ──
  insert into reminders (company_id, subject_type, subject_id, category, kind, mode, due_date, note)
  select c, 'vehicle', v.id, (array['registration','technical','fire_extinguisher'])[1+floor(random()*3)::int], 'date', 'date',
    (current_date + (floor(random()*400) - 60)::int), '[SEED]'
  from vehicles v cross join generate_series(1, 2) g where v.company_id = c;
  insert into reminders (company_id, subject_type, subject_id, category, kind, mode, due_km, note)
  select c, 'vehicle', v.id, 'service', 'date', 'km', (v.current_odometer + (floor(random()*5000) - 1000)::int), '[SEED]'
  from vehicles v where v.company_id = c;

  select count(*) into n_trips  from trips where company_id = c;
  select count(*) into n_events from trip_events where company_id = c;
  select count(*) into n_exp    from expenses where company_id = c;
  select count(*) into n_inv    from invoices where company_id = c;
  select count(*) into n_rem    from reminders where company_id = c;
  raise notice '[SEED] company=% owner=% trips=% events=% expenses=% invoices=% reminders=%', c, u, n_trips, n_events, n_exp, n_inv, n_rem;
end $$;
