# IZVEŠTAJ — v2-3 kriška 3: PUN CV UZ IZRIČIT PRISTANAK (ADR 0014)

> Završna marketplace v1 kockica: firma van zaposlenja može ZATRAŽITI pun CV; radnik EKSPLICITNO odobri (per-firma) i može OPOZVATI bilo kad → pristup se momentalno gasi. **Sve na DEV.**

## 1) Migracija 0037 (na DEV, primenjena i verifikovana)
- **`cv_consents`** (ledger: `worker_user_id`, `company_id`, `status` granted|revoked, `granted_at`, `revoked_at`) — **jedinstven AKTIVAN pristanak** po (radnik, firma) (partial unique). **`cv_requests`** (prelazni zahtev: pending|approved|denied|cancelled) — „inbox" radnika; **jedan otvoren zahtev** po (radnik, firma) → idempotentno. **Dve tabele namerno razdvojene** (KVALITET #1): audit-ledger pristanaka ≠ prolazni zahtev.
- **RLS:** radnik vidi SVOJE (`worker_user_id = auth.uid()`); office **read-only** vidi date SVOJOJ firmi (`is_office_role() and company_id = current_company_id()`); **niko treći**. Upis isključivo kroz definer RPC (obrazac accept/decline).
- **`career_view_mode` dopunjen režimom `consented`** (ISPRED `company` — pristanak daje VIŠE): office sa aktivnim pristankom radnika → **pun CV**; bez pristanka SVE ostaje kao dosad (`company` scope / `none`). Svih 6 `career_*` RPC-ova (`header/summary/employments/km_series/countries`) redefinisano: `mode = 'self'` → `mode in ('self','consented')`.
- **RPC-ovi toka (definer):** `cv_request(worker)` (office → pending + event, idempotentno), `cv_access(worker)` (granted|requested|none — za karticu), `my_cv_requests()` / `respond_cv_request(id, approve)` (radnik odgovara → approve upiše granted + event), `my_cv_consents()` / `revoke_cv_consent(company)` (radnik upravlja → opoziv + event).
- **Eventi (outbox):** `cv.request.sent` / `cv.consent.granted` / `cv.consent.revoked` (handleri **no-op v1** — worker već tretira neregistrovan tip kao no-op processed) + labele u `ActivityFeed`.

## 2) UI
- **Office (Mreža kartica):** `CardCvAction` — „Zatraži CV" (none) / „CV zatražen" (requested) / **„Pogledaj CV"** (granted → reuse `CareerProfileModal`; RPC vraća consented pun pogled).
- **Radnik:** `CvRequestsList` (zahtevi → Odobri/Odbij, uz JASAN tekst šta firma dobija: cela istorija kroz sve firme, ne samo njena) + `CvConsentsSection` („Ko vidi moj CV" — lista firmi + **Opozovi** bilo kad, uz potvrdu). Dodato na **vozačev Profil** i **onboarding dom radnika-bez-firme** (`WorkerOnboardingHome`).
- Novi `src/features/cv/` (`api.ts`, `CvRequestsList.tsx`, `CvConsentsSection.tsx`).

## 3) Testovi
- **Nova `cv_consent_test.sql` (17. svita):** bez pristanka office vidi SAMO svoju firmu (company-scope, nepromenjeno); firma van zaposlenja bez pristanka → `none` (career 42501); „Zatraži CV" idempotentno + `cv_access='requested'`; radnik odobri → granted; **granted → PUN CV** (2 firme/1500 km vs 1 firma/1000 km); **pristanak > company** (firma zaposlenja sa pristankom vidi pun CV); **izolacija** (firma A ne vidi pristanke firme B; office ne može direktan upis); **radnik upravlja samo svojim** (office ne može opozvati tuđi); **OPOZIV momentalno gasi** pristup (career → 42501).
- **Svih prethodnih 16 svita zeleno** (0037 aditivno; `career_*` redefinicije čuvaju self/company ponašanje — `career_test` zelen).
- **i18n svih 30:** `cv.*` (card/requests/consents) + `activity.event.cv_*` (`sr`/`en` autorski, ostali mašinski); `en` fallback — **0 MISS**.

## PODSETNIK — ručna primena
- **0037 je samo na DEV.** PROD/STAGING (na `0033`) i **0034/0035/0036/0037** čekaju STAGING/PROD uz izričito odobrenje.
- Rollback 0037: `drop function cv_request, cv_access, my_cv_requests, respond_cv_request, my_cv_consents, revoke_cv_consent;` vrati `career_view_mode` + 6 `career_*` na verzije 0027/0028 (bez `consented` grane); `drop table cv_requests, cv_consents;` (aditivno; ništa postojeće nije menjano osim tela career RPC-ova — vraćaju se 1:1).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` (jest) | ✅ 142/142 (21 svita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED (17 svita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ exit 0 |
| i18n 30/30 (en fallback, 0 MISS) | ✅ |
| Link ostao na DEV | ✅ `icbjagubaftoqcwfcbwf` |

**Kvalitet:** slojevi razdvojeni (ekrani → `features/cv/api.ts`); dve tabele razdvajaju ledger od zahteva (bez mešanja audita i prolaznog stanja); consented mod = jedna izmena u `career_view_mode` + mehanička dopuna 6 RPC-ova (bez duplirane logike); reuse `CareerProfileModal`/`CareerProfileView` za prikaz; upis kroz definer RPC (RLS bez insert/update politike); privatnost — radnik jedini upravlja pristankom, opoziv trenutan. Pravila ispoštovana.
