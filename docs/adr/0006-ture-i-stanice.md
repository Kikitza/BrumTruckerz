# ADR 0006 — Ture i stanice (ozvaničenje + javni broj ture)

## KONTEKST (danas u kodu/šemi)
- `trips` je centralni objekat; trojka **vozač/truk/prikolica visi na turi** (`0001:86-107`), jer se kombinacija menja po turi (data-model §1).
- Ruta: `trips.origin/destination` (`0003`), a više utovara/istovara je u `trip_stops` (uređen `seq`, `kind`, `place`) sa company-pripadnošću **izvedenom preko `trips`** (`0010`).
- Dnevnik `trip_events` je **append-only sa verzijama**; ispravka = RPC `correct_trip_event` (nova verzija, stara `is_current=false`), idempotentan preko `p_new_id` (`0002:142-181`, `0016`). Km po događaju + `stop_id` (`0011`).
- Vozač napreduje turu isključivo kroz RPC `driver_update_trip_progress` (status, start/end odometar; `0011:23-49`), nikad direktan UPDATE. Status ture = tip poslednjeg događaja (denormalizovan `trips.status`).
- Nema javnog/čitljivog broja ture (samo `uuid` PK).

## ODLUKA
- **Ozvaničiti postojeći model ture kao kanon** (`trips` + `trip_stops` + `trip_events` append-only + RPC-ovi) — bez restrukturiranja.
- Uvesti **javni broj ture `BT-T-XXXXX`** (čitljiv, po firmi ili globalno monoton) za komunikaciju/izvoz/fakturu (ADR 0008), vezan za `trips.id`.
- **Odbačeno:** (a) prebaciti trojku na vozilo — lomi istoriju i P&L po vozaču/truku (data-model §1); (b) dozvoliti UPDATE/DELETE na `trip_events` — krši append-only (audit A1); (c) koristiti `uuid` kao javni broj — nečitljiv za ljude/dokumente.

## SKICA ŠEME (nacrt)
```
trips.public_no  text unique      -- 'BT-T-#####' (generator: sekvenca po firmi ili global)
-- ostalo ostaje: trips, trip_stops(seq,kind,place), trip_events(version,is_current,supersedes_event_id)
-- RPC-ovi nepromenjeni: correct_trip_event (idempotentan), driver_update_trip_progress
```

## MIGRACIONI PUT (bez prekida)
1. Aditivno: `trips.public_no` (nullable), generator broja.
2. Backfill na stagingu: dodeli brojeve postojećim turama hronološki; proveri unikatnost.
3. `title`/`origin→destination` ostaju za prikaz; ništa se ne ruši.
4. PROD uz odobrenje.

## TESTOVI ČUVARI
- test:db (`correct_event_chain_test.sql`, postoji): lanac verzija (version+1, jedan `is_current`, `supersedes_event_id`), **idempotentnost** ponovnog `p_new_id`, owner UPDATE/DELETE na `trip_events` **odbijen** (append-only, A1); `unique(public_no)`.
- jest: validator `BT-T-XXXXX`; „status = poslednji događaj" logika.

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
