# IZVEŠTAJ — v2-3 FINALE: GENERALNA PROBA ZBIRNOG SYNC-a NA STAGINGU

> STAGING `webquovijioxmouvuiko`. **PROD NIJE diran.** Cilj: dokazati zbirni sync 0034→0037 na kopiji pravih podataka pre PROD-a. Link vraćen na DEV na kraju.

## 1) Link + stanje + DRY-RUN (kapija)
- Link staging → **istorija: 33 migracije, latest `0033`** (kako se očekivalo).
- `db push --linked --dry-run` → **TAČNO 4 migracije**, bez odstupanja:
  - `0034_memberships.sql`, `0035_network_profiles.sql`, `0036_firmless_worker_identity.sql`, `0037_cv_consents.sql`
- Nema odstupanja → nastavljeno.

## 2) Push + PRE/POSLE (paritet + [SEED] netaknut)
| Metrika | PRE | POSLE |
|---|---|---|
| latest migracija | 0033 | **0037** |
| app_users total | 2 | 2 |
| app_users sa firmom | 2 | 2 |
| active_company_id set | — | 2 |
| **memberships (aktivna)** | tabela ne postoji | **2** |
| network_profiles | ne postoji | **0** |
| cv_consents | ne postoji | **0** |
| cv_requests | ne postoji | **0** |
| [SEED] nalozi | 1 | **1 (netaknut)** |

- **BACKFILL PARITET:** memberships (2) **=** app_users sa firmom (2) ✓ — svaki postojeći nalog dobio tačno jedno aktivno članstvo = današnje stanje.
- Nove tabele prazne (0/0/0), pravi/[SEED] podaci netaknuti.

## 3) Edge funkcije
- Git provera: **nijedna funkcija u `supabase/functions/` nije menjana od poslednjeg staging deploya** (`f3caf7d`). → **NEMA redeploya.**
- Razlog bez posledica: kriška 3 eventi (`cv.request.sent`/`cv.consent.granted`/`cv.consent.revoked`) idu kroz POSTOJEĆI `emit_outbox_event`; outbox-worker neregistrovan tip tretira kao **no-op processed** (potvrđeno u kodu).

## 4) SMOKE (RPC nivo) — jedna transakcija sa ROLLBACK-om (sentinel)
- **Metod (namerno, strože bezbedno):** ceo smoke u jednoj transakciji poništenoj sentinel-om → **realni podaci 100% netaknuti, NULA ostatka** (zato nije trebao outbox/audit sweep — sve se poništi). Bezbednije od perzistentnih [SEED] redova + čišćenja.
- Ishodi (svi prošli — dostignut sentinel `SMOKE_STAGING_OK`, svaki neuspeh bi ranije prekinuo):
  - `SMOKE_IDENTITY_OK` — `ensure_identity` za svež nalog → čist identitet (role/company NULL);
  - `SMOKE_BTD_OK` — `ensure_worker_public_no('driver')` → BT-D;
  - `SMOKE_SEARCH_NOPII_OK` — mrežni profil visible → `network_search` vraća karticu sa javnim brojem, BEZ PII;
  - `SMOKE_CONSENTED_OK` — `cv_request` → `respond_cv_request(approve)` → `career_view_mode`=`consented`, `career_summary` prolazi (pun);
  - `SMOKE_REVOKE_OK` — `revoke_cv_consent` → `career_view_mode`=`none`, `career_summary` → 42501 **momentalno**.
- Post-smoke provera: 0 [SEED] firmi, 0 smoke naloga, tabele i dalje 0/0/0, memberships 2, app_users 2 — **potvrđeno bez ostatka**.

## 5) test:db PROTIV STAGINGA
- **Svih 17 svita PASS** (rollback-based, protiv kopije pravih podataka): rls_audit, correct_event_chain, identity, invitations, dispatcher, phone_change, customers, invoices, reminder_types, company_self, career, outbox, outbox_worker, memberships, network, firmless_worker, cv_consent.

## 6) Link vraćen na DEV (dokaz)
- `supabase link --project-ref icbjagubaftoqcwfcbwf` → OK; `.temp/project-ref` = `icbjagubaftoqcwfcbwf`.
- Dokaz razlike: DEV `app_users = 6` (staging = 2), latest `0037`. **Aktivan link = DEV.**

---

## TAČAN RECEPT ZA PROD (uwphmxxeuggitssdmgcz) — SAMO uz izričito odobrenje vlasnika
> Isti tok kao staging; STOP na svakom odstupanju. **Edge deploy NIJE potreban** (funkcije nepromenjene od poslednjeg PROD deploya `43e08cf`; cv.* eventi = no-op processed).

1. **Link + kapija:** `supabase link --project-ref uwphmxxeuggitssdmgcz` → potvrdi istoriju **latest `0033`**. `supabase db push --linked --dry-run` → mora **TAČNO** `0034,0035,0036,0037`. **Odstupanje → STANI.**
2. **PRE snimak:** zabeleži `app_users` total i `app_users where company_id is not null` (= očekivani backfill), i da nove tabele ne postoje.
3. **Push:** `supabase db push --linked`.
4. **POSLE (paritet):** `memberships (active)` **mora = app_users sa firmom** (PRE broj); `network_profiles/cv_consents/cv_requests = 0`; `app_users` total nepromenjen; pravi podaci netaknuti; latest `0037`.
5. **Edge:** preskoči (nepromenjeno). *(Ako bi ubuduće bila promena — `supabase functions deploy <ime>`.)*
6. **(Opciono) SMOKE:** isti rollback-sentinel blok kao u §4 (ništa ne persistira). Preskočivo — test:db pokriva.
7. **test:db protiv PROD-a (opciono, rollback-safe):** `npm run test:db` — svih 17 PASS.
8. **OBAVEZNO link nazad na DEV:** `supabase link --project-ref icbjagubaftoqcwfcbwf` + dokaz (`current_database`/broj app_users razlikuje PROD od DEV).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| Dry-run = tačno 0034–0037 | ✅ |
| Push staging | ✅ 4 primenjene |
| Backfill paritet (memberships = app_users/firma) | ✅ 2 = 2 |
| Nove tabele prazne, [SEED] netaknut | ✅ |
| Edge nepromenjen → bez deploya | ✅ |
| SMOKE (rollback, bez ostatka) | ✅ svih 5 tačaka |
| test:db protiv staginga | ✅ 17/17 |
| Link vraćen na DEV + dokaz | ✅ `icbjagubaftoqcwfcbwf` |
| PROD diran? | ❌ NE |

**Kvalitet:** staging generalna proba prošla kraj-na-kraj; realni podaci netaknuti (smoke rollback, nula ostatka); PROD recept spreman i uslovljen izričitim odobrenjem.
