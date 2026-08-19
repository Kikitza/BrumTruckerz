# ADR 0009 — Entitlementi i paketi

## KONTEKST (danas u kodu/šemi)
- `companies` nosi `plan` + `vehicle_limit` (`0013_company_plan_vehicle_limit.sql:11-12`) i `status ('active'|'suspended')` + `paid_until` + `billing_note` (`0014:18-22`).
- **Enforcement limita je u bazi:** before-insert trigger `enforce_vehicle_limit()` blokira unos preko `vehicle_limit` (`0013:16-40`); poznata sitna rupa: TOCTOU trka (audit C2).
- Plan/limit menja **samo platforma** preko admin RPC `admin_set_company_plan` (`0014:71`); owner ne može (companies ima samo `company_read`, `0013:6-9`).
- **Suspenzija** se sada sprovodi u RLS write-gate-u preko `company_is_active()` (0015): SELECT prolazi, INSERT/UPDATE/DELETE se blokira kad firma nije `active` (audit A3 zatvoren). Status čita i klijent (`getMyCompanyStatus`, fail-closed).

## ODLUKA
- **Ozvaničiti postojeći entitlement model** (`plan` / `vehicle_limit` / `status` / `paid_until`) kao kanon; menja ga isključivo platforma (admin RPC).
- Pripremiti **buduće limite po resursu** (npr. broj dispečera ≤100, broj naručilaca, GB skladišta) kroz **jedinstvenu tabelu entitlementa**, umesto kolone-po-limitu na `companies`.
- **Odbačeno:** (a) dodavati `dispatcher_limit`, `customer_limit`… kao zasebne kolone — `companies` raste bez kraja i svaki limit traži novu migraciju; (b) čuvati entitlemente u klijentu/RevenueCat kao izvor istine — baza mora da bude autoritet (offline/skript zaobilazak, audit A3); (c) enforce samo u UI — audit odbacuje (mora DB).

## SKICA ŠEME (nacrt)
```
-- kanon ostaje: companies.plan, vehicle_limit, status, paid_until, billing_note
entitlements (budući, generalizacija limita)
  company_id uuid → companies(id)
  key   text     -- 'vehicle_limit' | 'dispatcher_limit' | 'customer_limit' | ...
  value int
  primary key (company_id, key)
-- enforce_* trigger/helper čita entitlements.value po ključu (vehicle_limit prvo)
-- opciono: 'for update' na company redu protiv TOCTOU (C2)
```

## MIGRACIONI PUT (bez prekida)
1. Aditivno: `entitlements`; backfill `vehicle_limit` iz `companies` u `entitlements('vehicle_limit')`.
2. `enforce_vehicle_limit` čita iz `entitlements` sa fallbackom na `companies.vehicle_limit` (most) dok se ne pređe.
3. Novi limiti (dispečer/naručilac) se dodaju kao redovi, **bez** nove migracije šeme.
4. PROD uz odobrenje; opciono zatvoriti C2 (`for update`).

## TESTOVI ČUVARI
- test:db: insert vozila preko limita **odbijen** (`enforce_vehicle_limit`); owner ne može da menja plan/limit/status; suspendovana firma — INSERT odbijen / SELECT prolazi (`company_is_active`, A3).
- jest: `adminMath`/plan logika; mapiranje entitlement ključeva.

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
