# ADR 0003 — Uloge i matrice pristupa

## KONTEKST (danas u kodu/šemi)
- Enum `user_role` ima **tri** člana: `platform_admin`, `owner`, `driver` (`0001_init.sql:15`). Dispečer NE postoji.
- Pristup se rešava serverski preko SECURITY DEFINER helpera `current_company_id()`, `current_role_name()`, `current_driver_id()` (`0001:228-241`).
- Obrazac politika: owner = pun CRUD u svojoj firmi; vozač = usko (svoje ture, bez finansija) preko view-a `driver_trips` + RPC (`0001:295-360`, ADR 0006). `platform_admin` je 0014 **isečen** sa poslovnog sadržaja (`0014:24-47`) i sme samo meta preko admin RPC-ova (`0014:50-97`).
- Isti owner-obrazac se **ponavlja** na ~8 tabela (vehicles/trailers/drivers/reminders/trips/expenses/attachments/trip_stops) i u 0015 write-gate-u.

## ODLUKA
- Dodaje se rola **`dispatcher`**. Matrica (zaključana): dispečer = **sve kao owner** (uklj. finansije, troškove, naloge vozača) **OSIM**: (1) upravljanja **drugim dispečerima** i (2) **paketa/plana firme**.
- Politike se šire **sistemski**: gde je danas `current_role_name()='owner'`, uvodi se pomoćni predikat `is_office_role()` (`owner` OR `dispatcher`); izuzeci (dispečerski nalozi, plan) ostaju strogo `owner`.
- **Odbačeno:** (a) kopirati sve politike za `dispatcher` ručno — špageti, rizik divergencije (audit već zamera dupliranju); (b) dati dispečeru zaseban uzak skup — narušava „sve kao owner"; (c) rešavati u klijentu — RLS je pravi kontrolor (audit §6, D4).

## SKICA ŠEME (nacrt)
```
enum user_role += 'dispatcher'         -- ALTER TYPE ADD VALUE (van transakcije)
helper is_office_role() returns bool   -- current_role_name() in ('owner','dispatcher')
-- Politike na poslovnim tabelama: 'owner' -> is_office_role()
-- IZUZECI (ostaju samo 'owner'):
--   * upravljanje dispečerima (app_users/employments gde role='dispatcher')
--   * companies.plan / vehicle_limit (već owner-nedostupno; menja platforma, 0013)
-- dispečera pravi/briše vlasnik (ADR 0002 pozivnice)
```

## MIGRACIONI PUT (bez prekida)
1. `ADD VALUE 'dispatcher'` (zaseban korak, ne u istoj transakciji — kao `event_type`, `0011:13`).
2. Uvedi `is_office_role()`; prepiši postojeće owner-politike na njega **bez promene ponašanja za owner** (owner ostaje podskup).
3. Staging: dokaži da owner i dalje radi identično; tek onda kreiraj prvog dispečera.
4. PROD uz odobrenje.

## TESTOVI ČUVARI
- test:db (5 uloga): dispečer čita/piše poslovni sadržaj svoje firme; dispečer **ne** može da menja plan/limit ni da upravlja drugim dispečerima; owner nepromenjen; vozač i dalje bez finansija; firma A ≠ firma B; `platform_admin` i dalje 0 redova na `trip_events` (ADR 0007/§9).

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
