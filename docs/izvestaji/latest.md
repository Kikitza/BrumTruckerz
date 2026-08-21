# IZVEŠTAJ — v2-1: KARIJERNI PROFIL RADNIKA (CV iz stvarnog rada)

> Prva v2.0 kriška. Read-only CV za **vozača I dispečera** iz **postojećih** podataka. **Bez GPS-a, bez marketplace-a,
> bez „zemlje kroz koje je vozio"** (to je naredna kriška — nov podatak ruta→zemlja). Commit `56e2625` (push-ovan).

## 1) Podaci (stvarne tabele — provereno)
- **`employments`** (`0017`): firma + period (`started_at`/`ended_at`) + `role_on_company` + `status` → istorija zaposlenja.
- **`driver_month_rollup`** (`0001`): `company_id`,`driver_id`,`year_month`,`trips_count`,`total_km` (završene ture po `finished_at`) → zbir km/tura + grafikon.
- **`drivers`** (`user_id` **globalno jedinstven**, `0007`): osoba = JEDAN drivers red; **istorija po firmama živi na `rollup.company_id`**, ne na više drivers redova (ključno za autorizaciju/skoping).

## 2) Migracija 0027 — 5 READ-ONLY RPC-ova (SECURITY DEFINER, autorizacija eksplicitna)
| RPC | Vraća |
|---|---|
| `career_view_mode(p_user)` | `self` \| `company` \| `none` |
| `career_header(p_user)` | javni broj (BT-D/BT-T) + ime (profil → fallback `drivers.full_name`) |
| `career_summary(p_user)` | ukupno km, broj tura (rollup), broj firmi + staž (employments) |
| `career_employments(p_user)` | firma + period + uloga + status |
| `career_km_series(p_user)` | km/tura po mesecu (za grafikon) |

**RLS/privatnost (u RPC-u, bypass RLS pa eksplicitno):**
- `self` — radnik vidi SVOJ CV kroz **sve** firme (`p_user=null`→`auth.uid()`).
- `company` — office (owner/dispatcher, `is_office_role()`) vidi radnika **SVOJE** firme, ograničeno na `company_id = current_company_id()` (ne vidi šta je radio u drugim firmama — data-collision duh).
- `none` — izuzetak `42501`.

## 3) Ekrani (mobilni + web)
- **Vozač** `app/(driver)/profile.tsx`: postojeća identitet-kartica + **CV** (zbirne kartice, grafikon km/mesec, istorija zaposlenja).
- **Office pregled** — `app/(owner)/fleet.tsx`: u driver edit modalu dugme **„Karijera"** (samo kad vozač ima `user_id`) → `CareerProfileModal` (skopiran na firmu office-a).
- **Dispečer** `app/(owner)/settings.tsx`: **„Moj CV"** (samo `role==='dispatcher'`; vlasnik nije radnik-građanin) → `CareerProfileModal` (self).
- **Grafikon** `KmBarChart` — bez teške zavisnosti (čisti View-ovi), km po mesecu za izabranu godinu, prebacivač godina, ljubazna prazna stanja. (Nema chart biblioteke u projektu → jednostavan bar-grafikon.)

## 4) Feature sloj / kvalitet
- `src/features/career/`: `api.ts` (jedini sloj ka Supabase-u, kroz RPC), `calc.ts` (čiste fn: agregacija km, staž, period), `KmBarChart`, `CareerProfileView` (deljen, self/office), `CareerProfileModal`.
- Boje iz tokena, stringovi kroz `t()`, React Query keširanje; bez dupliranja (jedan `CareerProfileView`).

## 5) Testovi
- **`supabase/tests/career_test.sql`** (u `run.sh`): (a) self vidi svoj CV A+B (km 3000, tura 5, firmi 2); (b) radnik NE vidi tuđi (`42501`); (c) office B vidi radnika samo za B (km 2000, 1 firma, 1 zaposlenje); (d) office A vidi samo A (km 1000); (e) office A ne vidi radnika koji nije u A (`42501`). → **`npm run test:db` ALL PASSED**.
- **jest** `calc.test.ts` (agregacija km, staž, period). → **130/130**.

## 6) i18n
`career.*` (20 ključeva, ugnježdeno: `role.*`, `chart.*`) u **svih 30** jezika (sr/en autorski, 28 mašinskih); `en` fallback pun; status fajlova netaknut.

## PODSETNIK — ručna primena migracije
- **0027 je primenjen na DEV** (`supabase db push --linked`). **PROD/STAGING NIJE** — ide TEK uz izričito odobrenje vlasnika (ritual). Dok 0027 nije na PROD-u, CV ekrani u produkcionom buildu vraćaju grešku (RPC ne postoji). Rollback: `drop function career_view_mode/header/summary/employments/km_series` (samo funkcije; nema izmena podataka/šeme tabela).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` (jest) | ✅ 130/130 (19 suita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED (uklj. career_test) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ build prolazi |
| Native (Expo Go) | ✅ nedirano van dodatih ekrana |
| i18n 30/30 | ✅ |
| KVALITET KODA | ✅ jedan api sloj + jedan deljeni prikaz; RPC autorizacija eksplicitna |
| Link ostao na DEV | ✅ (`icbjagubaftoqcwfcbwf`) |
