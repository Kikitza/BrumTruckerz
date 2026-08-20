# IZVEŠTAJ — F1 FINALE 2/2: PROD SYNC (uwphmxxeuggitssdmgcz)

> STATUS: **URAĐENO na PRODU** (odobrenje dato). Migracije 0014–0020 primenjene, 3 Edge funkcije deploy-ovane,
> `test:db` protiv PRODA zeleno. **Link vraćen na DEV** (dokaz niže). Bez izmena koda (0020 fix je već u repou).
> **Tajne:** ovaj izveštaj sadrži samo imena/refove (identifikatori projekata), NIJEDNU vrednost lozinke/tokena/ključa.

## Rezultat: ✅ PROD SINHRONIZOVAN
PROD je bio na **0001–0013 sa urednom istorijom migracija** (za razliku od staginga koji istoriju nije imao).
Zato **baseline repair NIJE bio potreban** — CLI je odmah video 0014–0020 kao pending. Push čist iz prvog puta
(0020 prošao: PROD ima 0008 storage politike + `drop if exists` iz probe).

## 1) Stanje pre (STOP-kapija, read-only)
- `supabase_migrations.schema_migrations` **postoji**, sadrži **tačno `0001…0013`** (13 redova).
- `companies.plan` = da (0013), `companies.status` = ne (0014), `driver_profiles`/`invitations`/`dispatcher` = ne.
- `storage.objects` prilozi politike = **4** (pun 0008 — owner_read/write + driver_read/write) → `drop if exists` u 0020 radi.
- Zaključak: PROD = **0001–0013**, pending = 0014–0020 → **bez repair-a**, direktno dry-run.

## 2) Dry-run — TAČNO 0014–0020
```
Would push these migrations:
 • 0014_platform_admin.sql
 • 0015_audit_fixes.sql
 • 0016_correct_event_idempotent.sql
 • 0017_identity_profiles_employments.sql
 • 0018_invitations.sql
 • 0019_accept_invitation_name_fallback.sql
 • 0020_dispatcher_office_role.sql
```

## 3) Push + PRE/POSLE brojevi (aditivnost)
| Tabela | PRE | POSLE |
|---|---|---|
| companies | 1 | 1 |
| app_users | 1 | 1 |
| auth.users | 3 | 3 |
| drivers | 1 | 1 |
| vehicles | 5 | 5 |
| trailers | 1 | 1 |
| trips | 0 | 0 |
| reminders | 4 | 4 |
| driver_profiles (0017) | — | **0** |
| employments (0017) | — | **0** |
| invitations (0018) | — | 0 |

**0017 backfill na PRODU:** `drivers.user_id is not null` = **0** → backfill dodao **0 profila, 0 zaposlenja**,
ni za koga (nijedan vozač na PRODU nema povezan app nalog). Sve pre-postojeće tabele **nepromenjene** → čisto aditivno.
Verifikacija: istorija do **0020**, `user_role` ima `dispatcher`, `is_office_role` postoji, storage prilozi politike = **5**
(0008 driver_read/write + 0020 office owner_read/write + 0015 active_write).

## 4) test:db PROTIV PRODA
`npm run test:db` (linked = PROD) → **ALL PASSED** (rls_audit, correct_event_chain, identity, invitations, dispatcher,
phone_change). Fixture se rollback-uje (sentinel) → posle testova: companies 1, app_users 1, auth.users 3,
driver_profiles 0, employments 0, invitations 0 → **ništa nije ostalo**.

## 5) Edge funkcije na PRODU
`create-driver-account`, `delete-driver-account`, `get-driver-email` (requireOffice verzije) — **deploy-ovane**.

## 6) Auth PRODA — NEDIRAN
Nijedan Management API poziv nad PRODOM. Telefon i email-autoconfirm ostaju **isključeni** (SMS se pali tek po
sekciji „Aktivacija SMS-a na produkciji" iz `RUNBOOK.md`, uz posebno odobrenje).

## 7) Link vraćen na DEV (dokaz)
```
LINKED → BrumTruckerz-dev           icbjagubaftoqcwfcbwf
         BrumTruckerz-staging       webquovijioxmouvuiko
         (PROD)                     uwphmxxeuggitssdmgcz
```
`supabase/.temp/project-ref = icbjagubaftoqcwfcbwf`.

## Odstupanje od recepta (obrazloženo)
Recept iz F1 finala 1/2 predviđao je baseline repair 0001–0013 (jer staging istoriju nije imao). **PROD JE imao
urednu istoriju 0001–0013**, pa je korak repair **preskočen** — STOP-kapija „utvrdi stanje" upravo za to služi.
Ostatak recepta (dry-run → push → PRE/POSLE → edge → auth NE dirati → relink DEV) ispoštovan u celini.

## Migracije — stanje
- **DEV:** 0001–0020 (od ranije). **STAGING:** 0001–0020 (proba). **PROD:** 0001–0020 (**ovaj sync**).
- **HITNI SQL / rollback (PROD):** migracije su aditivne; enum vrednost se ne uklanja. Rollback po potrebi:
  vrati owner-uslov u politikama i `create or replace accept_invitation` bez dispečerske grane (v. 0020/0019).
  Nova prazna tabela `invitations` i `driver_profiles`/`employments` (0 redova na PRODU) mogu ostati bezbedno.

## Provere
| Provera | Rezultat |
|---|---|
| PROD dry-run | ✅ tačno 0014–0020 |
| PROD push | ✅ svih 7 primenjeno |
| PROD aditivnost | ✅ pre = posle (backfill 0/0) |
| `test:db` (PROD) | ✅ ALL PASSED (6 svita) |
| Edge deploy (PROD) | ✅ 3 funkcije |
| Link vraćen na DEV | ✅ (projects list) |

## Jezici
i18n **nije diran** (nema novih stringova).

## Kvalitet
Pravila ispoštovana: STOP-kapije poštovane (repair preskočen jer je stanje to nalagalo), aditivnost dokazana
pre/posle brojevima, nijedna tajna-vrednost nije zapisana, link vraćen na DEV.

## ČEKA SE (potez vlasnika)
1. (i dalje otvoreno) reset PROD DB lozinke; odluka o stagingu (reset lozinke ili obriši) — higijena posle proba.
2. Kad se krene na naplatu/telefon na PRODU: „Aktivacija SMS-a na produkciji" (RUNBOOK) uz odobrenje.
