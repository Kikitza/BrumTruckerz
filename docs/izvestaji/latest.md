# IZVEŠTAJ — v2-3 PROD ZBIRNI SYNC (0034→0037)

> PROD `uwphmxxeuggitssdmgcz`. Izvršeno uz **izričito odobrenje vlasnika** (lepljenje). Recept iz generalne probe primenjen doslovno, sa STOP-kapijama. Link vraćen na DEV. **Bez ijedne tajne u izveštaju.**

## 1) Sync 0034→0037

### Kapije (obe prošle)
- Link PROD → istorija **33 migracije, latest `0033`** (očekivano).
- `db push --linked --dry-run` → **TAČNO 4**: `0034_memberships`, `0035_network_profiles`, `0036_firmless_worker_identity`, `0037_cv_consents`. Bez odstupanja → nastavljeno.

### PRE / POSLE (paritet + prava firma netaknuta)
| Metrika | PRE | POSLE |
|---|---|---|
| latest migracija | 0033 | **0037** |
| app_users total | 1 | **1** |
| app_users sa firmom | 1 | 1 |
| active_company_id set | — | 1 |
| **memberships (aktivna)** | tabela ne postoji | **1** |
| companies | 1 | **1** |
| drivers | 1 | **1** |
| trips | 0 | **0** |
| network_profiles | ne postoji | **0** |
| cv_consents | ne postoji | **0** |
| cv_requests | ne postoji | **0** |

- **BACKFILL PARITET:** memberships aktivna (1) **=** app_users sa firmom (1) ✓ — postojeći nalog dobio tačno jedno aktivno članstvo = zatečeno stanje.
- **Prava firma netaknuta:** app_users/companies/drivers/trips brojevi **nepromenjeni**; nove tabele prazne (0/0/0).
- Push izlaz: 4 migracije primenjene (`0034,0035,0036,0037`).

## 2) Edge funkcije
- Git: **nijedna funkcija u `supabase/functions/` nije menjana od poslednjeg PROD deploya** (`43e08cf`). → **PRESKOČEN deploy.**
- Bez posledica: cv.* eventi (`cv.request.sent`/`cv.consent.granted`/`cv.consent.revoked`) idu kroz POSTOJEĆI `emit_outbox_event`; outbox-worker neregistrovan tip = **no-op processed**. PROD cron (`outbox-worker-every-5min` `*/5`, `reminders-cron-daily`) netaknut.

## 3) SMOKE (RPC nivo) — jedna transakcija sa ROLLBACK-om (sentinel)
- **Metod:** ceo smoke poništen sentinel-om `SMOKE_PROD_OK` → **prava firma 100% netaknuta, NULA ostatka** (nema outbox/audit sweep-a jer se sve poništi).
- Ishodi (svih 5 prošlo — dostignut sentinel; svaki neuspeh bi ranije prekinuo):
  - `SMOKE_IDENTITY_OK` — `ensure_identity` → čist identitet (role/company NULL);
  - `SMOKE_BTD_OK` — `ensure_worker_public_no('driver')` → BT-D;
  - `SMOKE_SEARCH_NOPII_OK` — visible mrežni profil → `network_search` kartica sa javnim brojem, BEZ PII;
  - `SMOKE_CONSENTED_OK` — `cv_request` → `respond_cv_request(approve)` → `career_view_mode`=`consented`, `career_summary` prolazi;
  - `SMOKE_REVOKE_OK` — `revoke_cv_consent` → `career_view_mode`=`none`, `career_summary` → 42501 **momentalno**.
- Post-smoke: 0 [SEED] firmi, 0 smoke naloga; app_users 1, companies 1, drivers 1, memberships 1, nove tabele 0/0/0 — **potvrđeno bez ostatka**.

## 4) test:db na PROD-u — PRESKOČEN (namerno)
- Svih **17 svita već dokazano na STAGING kopiji pravih podataka** (generalna proba, prethodni izveštaj) → manje diranja prave baze. Smoke (§3) potvrđuje ključni tok na samom PROD-u.

## 5) Link vraćen na DEV (dokaz)
- `supabase link --project-ref icbjagubaftoqcwfcbwf` → OK; `.temp/project-ref` = `icbjagubaftoqcwfcbwf`.
- Dokaz razlike: DEV `app_users = 6` (PROD = 1), latest `0037`. **Aktivan link = DEV.**

## Stanje okruženja (posle sync-a)
- **DEV, STAGING, PROD svi na `0037`.** v2-3 marketplace v1 (kriške 1, 2, 2b, 3) uživo na PROD-u.
- Edge (reminders-cron, outbox-worker) nepromenjen na sve tri; PROD cron aktivan.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| Dry-run = tačno 0034–0037 | ✅ |
| Push PROD | ✅ 4 primenjene |
| Backfill paritet (memberships = app_users/firma) | ✅ 1 = 1 |
| Prava firma netaknuta (app_users/companies/drivers/trips) | ✅ nepromenjeno |
| Nove tabele prazne | ✅ 0/0/0 |
| Edge nepromenjen → bez deploya | ✅ |
| SMOKE (rollback, bez ostatka) | ✅ svih 5 tačaka |
| test:db na PROD | ⏭️ preskočen (dokazano na stagingu) |
| Link vraćen na DEV + dokaz | ✅ `icbjagubaftoqcwfcbwf` |
| Tajne u izveštaju | ❌ nijedna |

**Kvalitet:** PROD sync po receptu, sve kapije prošle; prava firma netaknuta (smoke rollback, nula ostatka); backfill paritet dokazan brojevima; link vraćen na DEV sa dokazom.
