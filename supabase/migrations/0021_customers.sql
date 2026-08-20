-- ─────────────────────────────────────────────────────────────────────────────
-- 0021 — NARUČIOCI (kartoteka klijenata) + tura dobija naručioca. F2 kriška 1.
-- (VIES provera NIJE ovde — sledeća kriška.)
--
--   (A) customers — klijent firme (naziv obavezan; PIB/zemlja/kontakt/adresa/rok plaćanja
--       opciono; arhiviranje kroz archived_at). RLS: KANCELARIJA (owner+dispatcher) pun
--       pristup u SVOJOJ firmi; vozač NIŠTA (finansijska sfera); platform_admin NIŠTA
--       (poslovni sadržaj); RESTRICTIVE suspend-gate na upis (obrazac 0015).
--   (B) trips.customer_id — opciona veza ka naručiocu; ON DELETE RESTRICT (postojeće ture
--       ostaju bez naručioca — legalno i zauvek dozvoljeno; naručilac sa turama se ne briše,
--       samo arhivira).
--
-- driver_trips view (0001) je kolonski eksplicitan i NE dobija customer_id → vozač naručioca
-- NE vidi (ni ovde ni bilo gde). Ne diramo view.
-- ─────────────────────────────────────────────────────────────────────────────

create table customers (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  name               text not null,
  vat_number         text,                 -- PIB/VAT (VIES provera kasnije)
  country_code       text,                 -- 2 slova (npr. 'RS','DE') — tekst za sada
  contact_email      text,
  contact_phone      text,
  address            text,
  payment_terms_days int  not null default 30,
  note               text,
  archived_at        timestamptz,          -- null = aktivan
  created_at         timestamptz not null default now()
);
create index on customers (company_id, archived_at, name);

alter table customers enable row level security;

-- KANCELARIJA (owner+dispatcher) pun pristup naručiocima SVOJE firme.
-- Vozač i platform_admin: NEMA politike → NIŠTA (fail-closed).
create policy customers_office on customers for all
  using  (company_id = current_company_id() and is_office_role())
  with check (company_id = current_company_id() and is_office_role());

-- RESTRICTIVE suspend-gate na upis/izmenu/brisanje (obrazac 0015).
create policy customers_active_insert on customers as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy customers_active_update on customers as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy customers_active_delete on customers as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

-- ── Tura ↔ naručilac. RESTRICT: naručilac sa turama se ne briše (arhivira se). ──
alter table trips add column customer_id uuid references customers(id) on delete restrict;
create index on trips (company_id, customer_id);
