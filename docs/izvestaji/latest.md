# IZVEŠTAJ — F1 FINALE 1/2: GENERALNA PROBA NA STAGINGU (webquovijioxmouvuiko)

> STATUS: **URAĐENO na STAGINGU** (vlasnik odobrio). **PROD NIJE diran.** Link vraćen na DEV (dokaz niže).
> Commit `3b5212a` na `main` (jedina izmena koda: 0020 idempotentan storage drop — nalaz probe).

## Rezultat probe: ✅ PROŠLA (uz jedan nalaz, ispravljen)
Staging je bio na stanju **tačno 0001–0013** (restore je nosio public+auth). Baseline → push 0014–0020 →
Edge deploy → `test:db` protiv staginga: **sve zeleno**. Nalaz: 0020 je imao goli `drop policy` nad
`storage.objects` politikom koju restore nije doneo → **ispravljeno na `drop policy if exists`** (robusno
svuda; PROD, gde je 0008 primenjen normalno, nije pogođen).

## 1) Baseline (staging nema istoriju migracija)
- **Provera pre svega** (inspekcija šeme): `companies.plan` postoji (0013 ✓), `companies.status` NE (0014 ✗),
  `driver_profiles`/`invitations`/`dispatcher` enum NE — dakle stanje = **tačno 0001–0013**.
- `supabase migration repair --status applied 0001 … 0013 --linked` → „Migration history repaired".

## 2) Dry-run — TAČNO očekivano
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
Lista = **tačno 0014–0020** (bez odstupanja → nastavak).

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

**0017 backfill:** `drivers.user_id is not null` = **0** na stagingu (nijedan vozač nema povezan nalog) →
backfill dodao **0 profila i 0 zaposlenja**, ni za koga. Sve pre-postojeće tabele **nepromenjene** → čisto aditivno.
Verifikacija: `is_office_role` postoji, `user_role` ima `dispatcher`, istorija do **0020**.

> Napomena o incidentu: prvi push je pao na 0020 (`drop policy prilozi_owner_read` — ne postoji na stagingu jer
> restore nije nosio `storage` šemu; postojala je samo `prilozi_active_write` iz 0015). Migracija se **atomično
> vratila** (0014–0019 primenjene, 0020 NE; `dispatcher` enum se nije dodao). Posle ispravke (`if exists`) push
> 0020 prošao. Staging sad ima `prilozi_owner_read/write` (office) + `prilozi_active_write`; **fale** vozačke
> storage politike iz 0008 (`prilozi_driver_*`) — čisto **staging restore-artefakt**, ne tiče se PROD-a.

## 4) test:db PROTIV STAGINGA
`npm run test:db` (linked = staging) → **ALL PASSED**: rls_audit, correct_event_chain, identity, invitations,
dispatcher, phone_change. Fixture se rollback-uje (sentinel) → brojevi POSLE testova identični (companies 1,
app_users 1, driver_profiles 0, …) → **ništa nije ostalo**.

## 5) Auth podešavanja staginga — NEDIRANA
Nijedan Management API poziv nad stagingom. Telefon/autoconfirm ostaju isključeni (kao što će biti i na PRODU
do aktivacije SMS-a). 3 Edge funkcije (requireOffice verzije) deploy-ovane na staging.

## 6) Link vraćen na DEV (dokaz)
```
LINKED → BrumTruckerz-dev           icbjagubaftoqcwfcbwf
         BrumTruckerz-staging       webquovijioxmouvuiko
         (PROD)                     uwphmxxeuggitssdmgcz
```
`supabase/.temp/project-ref = icbjagubaftoqcwfcbwf`. DEV provere posle relinka: typecheck/jest(91)/lint(0
grešaka)/test:db — sve zeleno.

## TAČAN RECEPT ZA PROD (izveden iz ove probe — primeniti TEK uz izričito odobrenje)
> Pretpostavka koju PRVO proveriti: da li PROD ima istoriju migracija i na kom je stanju.

```bash
# 0) Link na PROD
supabase link --project-ref uwphmxxeuggitssdmgcz

# 1) UTVRDI STANJE (STOP-kapija). Pusti inspekciju šeme:
#    - da li postoji supabase_migrations.schema_migrations (istorija)?
#    - companies.plan (0013)?  companies.status (0014)?  driver_profiles (0017)?
supabase db query --linked -f supabase/tests/... (ad-hoc inspect: plan=1, status=?, driver_profiles=?)
#    AKO je PROD već na 0014+ (status postoji / ima istoriju) → recept NE važi, STANI i preispitaj.
#    AKO je PROD na 0001–0013 bez istorije (kao staging) → nastavi:

# 2) Baseline
supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 --linked

# 3) Dry-run — MORA biti TAČNO 0014–0020, inače STANI
supabase db push --linked --dry-run

# 4) Snimi PRE brojeve (ista counts.sql), pa push
supabase db push --linked

# 5) Snimi POSLE brojeve; proveri aditivnost i 0017 backfill
#    (na PRODU backfill dodaje profil+zaposlenje za SVAKOG drivers.user_id — prebroj unapred!)

# 6) Edge funkcije
supabase functions deploy create-driver-account --project-ref uwphmxxeuggitssdmgcz
supabase functions deploy delete-driver-account --project-ref uwphmxxeuggitssdmgcz
supabase functions deploy get-driver-email      --project-ref uwphmxxeuggitssdmgcz

# 7) (opciono) test:db protiv PRODA — fixture se rollback-uje, ništa ne ostaje

# 8) Auth: NE dirati (telefon/autoconfirm ostaju isključeni do „Aktivacije SMS-a" iz RUNBOOK-a)

# 9) OBAVEZNO vrati link na DEV
supabase link --project-ref icbjagubaftoqcwfcbwf && supabase projects list
```
**Razlike PROD vs staging koje očekivati:** (a) PROD ima 0008 storage politike (restore-artefakt sa staginga
ne postoji) → `drop if exists` svejedno radi; (b) 0017 backfill na PRODU **hoće** dodati profile/zaposlenja
ako neki vozači imaju naloge — prebroj `drivers where user_id is not null` PRE i uporedi POSLE.

## Izmene (kod)
- **`supabase/migrations/0020_dispatcher_office_role.sql`** — `drop policy` → **`drop policy if exists`** za
  `prilozi_owner_read`/`prilozi_owner_write` (robusnost na okruženja bez `storage` šeme). Jedina izmena; DEV
  stanje nepromenjeno (politike već postoje), PROD nepogođen.

## Provere (DEV, posle relinka)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 91/91 |
| `npm run lint` | ✅ 0 grešaka |
| `npm run test:db` (DEV) | ✅ ALL PASSED |
| `test:db` (STAGING) | ✅ ALL PASSED (6 svita) |

## Jezici
i18n **nije diran** (nema novih stringova).

## ČEKA SE (potez vlasnika)
1. Odobrenje za **PROD** primenu po receptu gore (F1 FINALE 2/2).
2. (i dalje otvoreno iz kriške 3) reset PROD DB lozinke; odluka o stagingu (reset lozinke ili obriši).
