-- 0001_init.sql
-- Model podataka za aplikaciju za praćenje tura (transport / špedicija).
-- Postgres / Supabase. Multi-tenant: tenant = FIRMA (company_id na svakom redu).
--
-- Skala-odluke ugrađene od starta:
--   * company_id na svakom tenant redu; indeksi VOĐENI sa company_id
--   * particija-spremna šema (created_at na velikim tabelama)
--   * rollup tabela za izveštaje/performans (ne skeniramo sve ture)
--   * KOLONSKA privatnost preko view-ova (vozač ne vidi zaradu/vozarinu)
--   * slike NISU u bazi — u attachments stoji samo ključ objekta (Cloudflare R2)

-- ─────────────────────────────────────────────────────────────
-- ENUM tipovi
-- ─────────────────────────────────────────────────────────────
create type user_role        as enum ('platform_admin','owner','driver');
create type trip_status      as enum ('draft','loading','driving','border','unloading','finished');
create type event_type       as enum ('load','unload','border','driving','rest','other');
create type expense_category as enum ('fuel','toll','customs','forwarding','parking','other');
create type driver_pay_mode  as enum ('per_diem','percentage','fixed');
create type reminder_subject as enum ('vehicle','trailer','driver');
create type reminder_kind    as enum ('date','mileage');

-- ─────────────────────────────────────────────────────────────
-- Tenant + korisnici
-- ─────────────────────────────────────────────────────────────
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  pib           text,
  maticni_broj  text,
  base_currency text not null default 'EUR',
  created_at    timestamptz not null default now()
);

-- Preslikava Supabase auth.users -> uloga + firma
create table app_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,  -- null samo za platform_admin
  role       user_role not null,
  full_name  text,
  phone      text,
  created_at timestamptz not null default now()
);
create index on app_users (company_id);

-- ─────────────────────────────────────────────────────────────
-- Flota: vozila, prikolice, vozači  (prikolica je ZASEBAN entitet)
-- ─────────────────────────────────────────────────────────────
create table vehicles (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  registration     text not null,
  make_model       text,
  norm_consumption numeric(5,2),       -- očekivana potrošnja L/100km (metrika ostvareno vs očekivano)
  current_odometer integer default 0,  -- ažurira se iz tura (za km-rokove / servise)
  created_at       timestamptz not null default now()
);
create index on vehicles (company_id);

create table trailers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  registration text not null,
  type         text,
  created_at   timestamptz not null default now()
);
create index on trailers (company_id);

-- Vozač kao entitet flote/HR-a; user_id ga (opciono) veže sa app nalogom
create table drivers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  user_id         uuid references app_users(id) on delete set null,
  full_name       text not null,
  employment_type text,   -- 'indefinite' | 'fixed_term'
  contract_end    date,   -- ako je na određeno (prati se i u reminders)
  created_at      timestamptz not null default now()
);
create index on drivers (company_id);
create index on drivers (user_id);

-- ─────────────────────────────────────────────────────────────
-- TURA (centralni objekat). Trojka truk/prikolica/vozač je zaključana na TURU,
-- jer se kombinacija menja po turi — veza stoji ovde, NE na vozilu.
-- ─────────────────────────────────────────────────────────────
create table trips (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,

  driver_id      uuid not null references drivers(id),
  vehicle_id     uuid not null references vehicles(id),
  trailer_id     uuid references trailers(id),      -- opciono (nekad bez prikolice / zamena usput)

  title          text,                              -- npr. "Beograd -> München"
  status         trip_status not null default 'draft',
  start_odometer integer,                           -- km na polasku
  end_odometer   integer,                           -- km po povratku u firmu (ukupno)

  revenue        numeric(12,2),                     -- vozarina (unosi VLASNIK), EUR po srednjem kursu

  driver_pay_mode driver_pay_mode,                  -- dnevnice / procenat / fiksno (za izveštaj)
  driver_pay      numeric(12,2),                    -- konačan iznos naknade vozaču, EUR

  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);
-- Indeksi vođeni sa company_id (svaki upit gađa jednu firmu) + za izveštaje
create index on trips (company_id, created_at);
create index on trips (company_id, driver_id, created_at);
create index on trips (company_id, vehicle_id, created_at);
create index on trips (company_id, status);

-- Dnevnik događaja (utovar/na putu/granica/istovar…), uređiv "u nedogled".
-- Trenutni status = tip poslednjeg događaja (denormalizovan u trips.status).
create table trip_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  trip_id     uuid not null references trips(id) on delete cascade,
  type        event_type not null,
  occurred_at timestamptz not null default now(),
  location    text,
  note        text,
  created_at  timestamptz not null default now()
);
create index on trip_events (company_id, trip_id, occurred_at);

-- Troškovi ture (gorivo, putarina, carina, špedicija, parking…). Sve ručni unosi.
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  trip_id     uuid not null references trips(id) on delete cascade,
  category    expense_category not null,
  amount      numeric(12,2) not null,        -- EUR po srednjem kursu
  currency    text not null default 'EUR',   -- zadržano za budući FX; MVP tretira sve kao EUR
  liters      numeric(8,2),                  -- samo za category='fuel'
  country     text,
  occurred_at timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);
create index on expenses (company_id, trip_id);
create index on expenses (company_id, category, occurred_at);

-- Slike/dokumenti — u bazi samo METAPODATAK; fajl je u object storage-u (R2).
create table attachments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  trip_id     uuid references trips(id) on delete cascade,
  expense_id  uuid references expenses(id) on delete cascade,
  kind        text not null,     -- 'cmr' | 'invoice' | 'customs' | 'fuel_receipt' | 'other'
  storage_key text not null,     -- ključ objekta u R2 (kompresovano na uređaju pre uploada)
  created_at  timestamptz not null default now()
);
create index on attachments (company_id, trip_id);

-- ─────────────────────────────────────────────────────────────
-- ROKOVI: vise na vozilo / prikolicu / vozača; dva tipa (datum / kilometraža)
-- ─────────────────────────────────────────────────────────────
create table reminders (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  subject_type reminder_subject not null,  -- vehicle | trailer | driver
  subject_id   uuid not null,              -- id vozila/prikolice/vozača (polimorfno)
  category     text not null,              -- 'registration','technical','tacho_calibration',
                                           -- 'fire_extinguisher','license_excerpt','cemt','code95',
                                           -- 'medical','adr','green_card','tacho_card','contract',
                                           -- 'service' — ili custom (predefinisano + "dodaj svoju")
  kind         reminder_kind not null,     -- 'date' (isticanje) | 'mileage' (servis po km)
  due_date     date,                       -- kind='date'
  due_odometer integer,                    -- kind='mileage' (sledeći servis na X km)
  interval_km  integer,                    -- opciono: interval servisa
  last_done_km integer,                    -- kada je poslednji put urađeno (km)
  note         text,
  created_at   timestamptz not null default now()
);
create index on reminders (company_id, subject_type, subject_id);
-- cron skenira samo ono što ističe u prozoru (npr. narednih 30 dana)
create index on reminders (company_id, kind, due_date);

-- ─────────────────────────────────────────────────────────────
-- GLOBALNI podaci (održava platform_admin) — NEMA company_id
-- ─────────────────────────────────────────────────────────────
-- Zabrane: admin ubacuje fajl kroz app; vozači vide poslednjih 12 meseci.
create table restrictions (
  id          uuid primary key default gen_random_uuid(),
  country     text,
  valid_month date not null,   -- mesec na koji se odnosi (1. u mesecu)
  storage_key text not null,   -- PDF/fajl u storage-u
  source_url  text,            -- zvanični EU izvor (ograda: ne odgovaramo za tačnost)
  note        text,
  created_at  timestamptz not null default now()
);
create index on restrictions (valid_month);

-- Resursi: vulkanizeri na terenu, brojevi policije/hitne, info o zemljama.
create table resources (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,   -- 'tire_service' | 'police' | 'emergency' | 'country_info'
  title      text not null,
  phone      text,
  url        text,
  country    text,
  note       text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- ROLLUP za izveštaje/performans (inkrementalno osvežavan po (vozač, mesec))
-- ─────────────────────────────────────────────────────────────
create table driver_month_rollup (
  company_id      uuid not null references companies(id) on delete cascade,
  driver_id       uuid not null references drivers(id) on delete cascade,
  year_month      date not null,               -- 1. u mesecu
  trips_count     integer       not null default 0,
  total_km        bigint        not null default 0,
  total_fuel_l    numeric(12,2) not null default 0,
  total_revenue   numeric(14,2) not null default 0,
  total_cost      numeric(14,2) not null default 0,
  total_profit    numeric(14,2) not null default 0,
  expected_fuel_l numeric(12,2) not null default 0,  -- Σ(norm_consumption/100 * km)
  primary key (company_id, driver_id, year_month)
);

-- ─────────────────────────────────────────────────────────────
-- Pomoćne funkcije za RLS (čitaju ulogu/firmu/vozača iz app_users)
-- ─────────────────────────────────────────────────────────────
create or replace function current_company_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select company_id from app_users where id = auth.uid()
$$;

create or replace function current_role_name() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid()
$$;

create or replace function current_driver_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from drivers where user_id = auth.uid()
$$;

-- ─────────────────────────────────────────────────────────────
-- Uključi RLS
-- ─────────────────────────────────────────────────────────────
alter table companies           enable row level security;
alter table app_users           enable row level security;
alter table vehicles            enable row level security;
alter table trailers            enable row level security;
alter table drivers             enable row level security;
alter table trips               enable row level security;
alter table trip_events         enable row level security;
alter table expenses            enable row level security;
alter table attachments         enable row level security;
alter table reminders           enable row level security;
alter table restrictions        enable row level security;
alter table resources           enable row level security;
alter table driver_month_rollup enable row level security;

-- Firma: vlasnik čita svoju; platform_admin sve
create policy company_read on companies for select using (
  current_role_name() = 'platform_admin' or id = current_company_id()
);

-- Korisnici: svako vidi sebe; vlasnik vidi korisnike svoje firme; admin sve
create policy users_read on app_users for select using (
  id = auth.uid()
  or (current_role_name() = 'owner' and company_id = current_company_id())
  or current_role_name() = 'platform_admin'
);

-- ── OWNER-managed tenant tabele (vlasnik pun pristup svojoj firmi; admin sve) ──
-- Isti obrazac se ponavlja; vozač NE upravlja flotom/rokovima.
create policy vehicles_tenant on vehicles for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));

create policy trailers_tenant on trailers for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));

create policy drivers_tenant on drivers for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));

create policy reminders_tenant on reminders for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));

create policy rollup_tenant on driver_month_rollup for select
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));

-- ── TURE: bazna tabela sadrži finansije -> pristup SAMO vlasnik + admin ──
-- (Vozač NE čita bazne trips; koristi driver_trips view bez finansija.)
create policy trips_owner on trips for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));

-- ── Događaji / troškovi / prilozi: vlasnik pun; VOZAČ samo za SVOJE ture ──
-- (Ove tabele nemaju finansijsku tajnu — troškove vozač ionako unosi.)
create policy events_owner on trip_events for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));
create policy events_driver on trip_events for all
  using  (current_role_name()='driver' and company_id=current_company_id()
          and exists (select 1 from trips t where t.id=trip_id and t.driver_id=current_driver_id()))
  with check (current_role_name()='driver' and company_id=current_company_id()
          and exists (select 1 from trips t where t.id=trip_id and t.driver_id=current_driver_id()));

create policy expenses_owner on expenses for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));
create policy expenses_driver on expenses for all
  using  (current_role_name()='driver' and company_id=current_company_id()
          and exists (select 1 from trips t where t.id=trip_id and t.driver_id=current_driver_id()))
  with check (current_role_name()='driver' and company_id=current_company_id()
          and exists (select 1 from trips t where t.id=trip_id and t.driver_id=current_driver_id()));

create policy attach_owner on attachments for all
  using  (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'))
  with check (current_role_name()='platform_admin' or (company_id=current_company_id() and current_role_name()='owner'));
create policy attach_driver on attachments for all
  using  (current_role_name()='driver' and company_id=current_company_id()
          and exists (select 1 from trips t where t.id=trip_id and t.driver_id=current_driver_id()))
  with check (current_role_name()='driver' and company_id=current_company_id()
          and exists (select 1 from trips t where t.id=trip_id and t.driver_id=current_driver_id()));

-- ── Globalni podaci: čita svaki ulogovan; menja samo platform_admin ──
create policy restrictions_read on restrictions for select using (auth.uid() is not null);
create policy restrictions_admin on restrictions for all
  using (current_role_name()='platform_admin') with check (current_role_name()='platform_admin');
create policy resources_read on resources for select using (auth.uid() is not null);
create policy resources_admin on resources for all
  using (current_role_name()='platform_admin') with check (current_role_name()='platform_admin');

-- ─────────────────────────────────────────────────────────────
-- VOZAČ: napredovanje ture ide preko RPC-a (bez direktnog UPDATE trips),
-- da vozač NIKAD ne dira finansijske kolone.
-- ─────────────────────────────────────────────────────────────
create or replace function driver_update_trip_progress(
  p_trip_id uuid, p_status trip_status default null, p_end_odometer integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_vehicle uuid;
begin
  update trips
     set status       = coalesce(p_status, status),
         end_odometer = coalesce(p_end_odometer, end_odometer),
         finished_at  = case when p_status = 'finished' then now() else finished_at end
   where id = p_trip_id and driver_id = current_driver_id()
   returning vehicle_id into v_vehicle;

  if not found then raise exception 'Nije dozvoljeno ili tura ne postoji'; end if;

  -- ažuriraj kilometražu vozila (hrani km-rokove/servise)
  if p_end_odometer is not null then
    update vehicles set current_odometer = greatest(current_odometer, p_end_odometer)
     where id = v_vehicle;
  end if;
end $$;
grant execute on function driver_update_trip_progress(uuid, trip_status, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- POGLEDI
-- ─────────────────────────────────────────────────────────────

-- Vozačev pogled na ture: SAMO njegove, BEZ finansija (revenue/profit/driver_pay).
-- security_invoker=off -> pogled sam filtrira kroz WHERE (ne oslanja se na RLS pozivaoca).
create view driver_trips with (security_invoker = off) as
  select t.id, t.company_id, t.driver_id, t.vehicle_id, t.trailer_id,
         t.title, t.status, t.start_odometer, t.end_odometer,
         t.started_at, t.finished_at, t.created_at
  from trips t
  where t.driver_id = current_driver_id();
grant select on driver_trips to authenticated;

-- P&L po turi (bazna valuta EUR). Finansijski -> security_invoker=on,
-- pa RLS na trips ograničava na vlasnika firme (vozač ne vidi).
create view trip_pnl with (security_invoker = on) as
  select
    t.id           as trip_id,
    t.company_id,
    t.driver_id,
    t.vehicle_id,
    (t.end_odometer - t.start_odometer)                            as total_km,
    t.revenue                                                      as revenue,
    coalesce(e.expenses_total, 0)                                  as expenses_total,
    coalesce(t.driver_pay, 0)                                      as driver_pay,
    coalesce(e.expenses_total,0) + coalesce(t.driver_pay,0)        as cost,
    t.revenue - (coalesce(e.expenses_total,0)+coalesce(t.driver_pay,0)) as profit,
    coalesce(e.fuel_liters, 0)                                     as fuel_liters,
    case when (t.end_odometer - t.start_odometer) > 0
         then round(coalesce(e.fuel_liters,0)/(t.end_odometer-t.start_odometer)*100, 2) end
                                                                   as consumption_l_per_100,
    case when (t.end_odometer - t.start_odometer) > 0
         then round((t.revenue-(coalesce(e.expenses_total,0)+coalesce(t.driver_pay,0)))
                    /(t.end_odometer-t.start_odometer), 2) end
                                                                   as profit_per_km
  from trips t
  left join (
    select trip_id,
           sum(amount)                                                as expenses_total,
           sum(case when category='fuel' then coalesce(liters,0) else 0 end) as fuel_liters
    from expenses group by trip_id
  ) e on e.trip_id = t.id;
grant select on trip_pnl to authenticated;

-- Performans po vozaču (iz rollup-a -> brzo). Pet metrika; period se bira u app-u
-- filtriranjem po year_month. Vlasnik bira po čemu rangira za nagradu.
create view driver_performance with (security_invoker = on) as
  select
    r.company_id,
    r.driver_id,
    sum(r.trips_count)                                              as trips,                 -- (2) po broju tura
    sum(r.total_km)                                                 as km,                    -- (1) po km
    case when sum(r.total_km)>0
         then round(sum(r.total_fuel_l)/sum(r.total_km)*100, 2) end as consumption_l_per_100, -- (3) po potrošnji goriva
    case when sum(r.total_km)>0
         then round(sum(r.total_profit)/sum(r.total_km), 2) end     as profit_per_km,         -- (4) profit/km (pošteno)
    case when sum(r.expected_fuel_l)>0
         then round(sum(r.total_fuel_l)/sum(r.expected_fuel_l), 2) end as actual_vs_expected  -- (5) ostvareno/očekivano (<1 bolje)
  from driver_month_rollup r
  group by r.company_id, r.driver_id;
grant select on driver_performance to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Osvežavanje rollup-a za jedan (vozač, mesec) IZ BAZNIH tabela.
-- Pošto su ture uredive "u nedogled", najsigurnije je preračunati ceo bucket
-- na svaku izmenu završene ture (okidač na trips/expenses) ili kroz noćni job.
-- ─────────────────────────────────────────────────────────────
create or replace function refresh_driver_month(p_company uuid, p_driver uuid, p_ym date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into driver_month_rollup as r
    (company_id, driver_id, year_month, trips_count, total_km, total_fuel_l,
     total_revenue, total_cost, total_profit, expected_fuel_l)
  select
    p_company, p_driver, p_ym,
    count(*),
    coalesce(sum(t.end_odometer - t.start_odometer), 0),
    coalesce(sum(x.fuel_l), 0),
    coalesce(sum(t.revenue), 0),
    coalesce(sum(coalesce(x.exp_total,0) + coalesce(t.driver_pay,0)), 0),
    coalesce(sum(t.revenue - (coalesce(x.exp_total,0) + coalesce(t.driver_pay,0))), 0),
    coalesce(sum(v.norm_consumption/100.0 * (t.end_odometer - t.start_odometer)), 0)
  from trips t
  join vehicles v on v.id = t.vehicle_id
  left join (
    select trip_id,
           sum(amount) as exp_total,
           sum(case when category='fuel' then coalesce(liters,0) else 0 end) as fuel_l
    from expenses group by trip_id
  ) x on x.trip_id = t.id
  where t.company_id = p_company
    and t.driver_id  = p_driver
    and t.status     = 'finished'
    and t.finished_at is not null
    and date_trunc('month', t.finished_at)::date = p_ym
  on conflict (company_id, driver_id, year_month) do update set
    trips_count     = excluded.trips_count,
    total_km        = excluded.total_km,
    total_fuel_l    = excluded.total_fuel_l,
    total_revenue   = excluded.total_revenue,
    total_cost      = excluded.total_cost,
    total_profit    = excluded.total_profit,
    expected_fuel_l = excluded.expected_fuel_l;
end $$;

-- NAPOMENA: okidače (triggers) na trips/expenses koji zovu refresh_driver_month
-- dodaj u sledećoj migraciji kad ustališ šemu; za MVP može i eksplicitan poziv
-- pri prelasku ture u 'finished'.
