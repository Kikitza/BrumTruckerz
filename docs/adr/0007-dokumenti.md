# ADR 0007 — Dokumenti (generički model priloga)

## KONTEKST (danas u kodu/šemi)
- `attachments` u bazi drži **samo metapodatak** (`storage_key`), fajl je u privatnom Storage bucketu `prilozi`; pristup preko potpisanih URL-ova + storage policy (`0001:145-155`, `0008`, `attachments/api.ts`).
- Vezivanje je danas **usko na turu/trošak**: `attachments.trip_id` i `attachments.expense_id` (`0001:149-150`), `kind ∈ {cmr,invoice,customs,fuel_receipt,other}`.
- `storage_key` je backend-agnostičan (`company_id/trip_id/uuid.jpg`) → R2 kasnije bez migracije podataka (CLAUDE.md, `0008`).
- Upload uvek ide kroz **offline red** (handler `attachment.upload`), idempotentno (klijentski uuid + `upsert`); RLS: owner po firmi, vozač po svojoj turi (`driver_can_access_trip`, `0009`).

## ODLUKA
- **Jedan generički model priloga** za više domena: tura / vozilo / vozač / **faktura** (ADR 0008) — umesto da svaki domen dobija svoje kolone/tabelu.
- Zadržati `attachments` kao osnovu; uvesti **polimorfnu vezu** (`owner_type` + `owner_id`) uz zadržane `trip_id/expense_id` kao most.
- **Odbačeno:** (a) zasebna tabela priloga po domenu — dupliranje + N storage-politika; (b) široki nullable FK-ovi za svaki novi domen (`vehicle_id`, `driver_id`, `invoice_id`…) — tabela raste bez kraja; (c) fajl u bazi (bytea) — protiv skala-odluke (slike van baze, data-model §6).

## SKICA ŠEME (nacrt)
```
attachments (evolucija)
  id, company_id, kind, storage_key, created_at            -- ostaje
  owner_type text   -- 'trip' | 'expense' | 'vehicle' | 'driver' | 'invoice'
  owner_id   uuid   -- ka domenu
  trip_id, expense_id                                       -- MOST (ostaju dok se ne pređe)
-- storage_key šema po domenu: company_id/<owner_type>/<owner_id>/uuid.jpg
-- RLS: owner po company_id; vozač po turi (driver_can_access_trip) — ostali domeni owner-only
```

## MIGRACIONI PUT (bez prekida)
1. Aditivno: `owner_type` + `owner_id` (nullable).
2. Backfill na stagingu: `trip_id → (owner_type='trip', owner_id=trip_id)`, `expense_id → 'expense'`.
3. Nove storage-politike po `owner_type` uz zadržane postojeće (`0008`); `company_id/trip_id/...` putanje ostaju važeće (most).
4. PROD uz odobrenje; DELETE i dalje ostavlja siročiće u Storage-u (postojeća MVP odluka, `0008:9`).

## TESTOVI ČUVARI
- test:db: owner vidi samo priloge svoje firme; vozač samo svoje ture; `owner_type='vehicle'/'driver'/'invoice'` nedostupni vozaču; backfill ne menja broj priloga.
- jest: mapiranje `kind`/`owner_type` po domenu; `storage_key` konvencija.

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
