# IZVEŠTAJ — v2-3 kriška 2b: RADNIK BEZ FIRME — IDENTITET I DOM (ADR 0013 dopuna)

> Otključava ključnu marketplace personu: radnik gradi mrežni profil i prima pozive **pre** nego što uđe u ijednu firmu. **Sve na DEV.**

## KORAK 0 — ADR 0013 DOPUNA
- U `docs/adr/0013` dodata sekcija **DOPUNA (22.8, kriška 2b)**, STATUS ostaje **PRIHVAĆENO**: identitet sme postojati bez ijednog članstva; `app_users` = čist identitet; `company_id`/`role` legacy fallback, **nullable za ne-admina**; rola izvire iz `memberships`. „Radnik bez firme" = identitet sa 0 aktivnih članstava.

## 1) Migracija 0036 (na DEV, primenjena i verifikovana)
- **Omekšan `app_users_company_by_role`** + `role` sada **nullable**: dozvoljen čist identitet (`role NULL` + `company_id NULL`). Invarijanta ostaje: ne-admin ili ima firmu, ili je potpuno prazan identitet (**nikad „rola bez firme"**). Postojeći podaci netaknuti (svi imaju firmu → zadovoljavaju i novi constraint).
- **`ensure_identity()`** (definer): bootstrap čistog identiteta za `auth.uid()` bez reda; idempotentno; ime iz auth metapodataka. **RPC a NE triger** (obrazloženo u migraciji: `auth` šemom upravlja Supabase — triger krhak kroz nadogradnje; RPC drži bootstrap u našoj šemi, klijent ga zove na prvom ulasku).
- **`ensure_worker_public_no(role)`** (definer): pri deklarisanju role dodeli **trajni javni broj** radniku bez firme — vozač → **BT-D** (auto sekvenca); dispečer → profil osiguran, broj „po potrebi" (ADR 0001; **ne uvodimo novu šemu bez ADR-a** — `BT-T` je broj TURE po ADR 0006, ne dispečera). Idempotentno.
- **`my_worker_public_no()`** (definer): radnik čita svoj dodeljeni broj (za prikaz u domu).
- Profili (`driver_profiles`/`dispatcher_profiles`) rade za korisnika BEZ firme — FK je na `app_users(id)` (identitet), ne na firmu; dodela ide kroz definer RPC (tabele nemaju INSERT politiku za obične uloge).

## 2) useSession / gate
- `useSession`: `single()` → **`maybeSingle()`**; kad nema `app_users` reda → **`ensure_identity()`** (idempotentno) pa rola ostaje `null`. `role` sme biti `null` (identitet bez firme) — fail-closed očuvan (nikad na owner).
- `app/index.tsx`: rola `null` → **onboarding dom radnika** (umesto starog skromnog `NoRole`).

## 3) Onboarding DOM radnika-bez-firme
- **`src/features/onboarding/WorkerOnboardingHome.tsx`** (novi; `DesktopContainer`, radi na MOBILNOM i WEBU — web = kapija akvizicije):
  - naslov/priča „Dobrodošao — napravi svoj profil ili se pridruži firmi";
  - **MREŽNI PROFIL editor + POZIVI** (reuse iz kriške 2); pri čuvanju profila sa traženom rolom → dodela BT broja (`ensure_worker_public_no`) i prikaz broja u editoru;
  - postojeće opcije ostaju: **„Imam kod firme"** (`AcceptInviteBox`) i **„Otvori novu firmu"** (čarobnjak) + Odjava.
- `NetworkProfileEditor`: novi prikaz javnog broja (`profile.publicNo`) + dodela pri čuvanju.

## 4) Prelazak u firmu
- Kad radnik-bez-firme **prihvati poziv/kod** → `accept_invitation` (postojeći tok iz 0034: identitet sa `company_id NULL` → ažurira `role`+`company`) → kreira članstvo → gate ga preusmeri u firmu (`reloadRole`/`reloadAppUser`). **Mrežni profil ostaje njegov; vidljivost se NE menja sama** (dokazano testom).

## 5) Pretraga i career
- `network_search`: kartice rade i za radnike **bez ijedne firme** (imaju BT-D). Dokazano testom.
- Career RPC-ovi (`career_header/summary/km_series/employments`) **ne pucaju** za identitet bez employments — vraćaju prazno stanje (dokazano testom).

## 6) Testovi
- **Nova `firmless_worker_test.sql` (16. svita):** constraint invarijanta (rola-bez-firme odbijena, prazan identitet dozvoljen); `ensure_identity` idempotentan (čist identitet); `ensure_worker_public_no('driver')` → BT-D (idempotentno) + `my_worker_public_no`; mrežni profil + **vidljiv u pretrazi bez firme**; **career ne puca** za prazan identitet; **poziv→accept kreira članstvo + rola izvire** (`app_users.role`=driver, company set); vidljivost mrežnog profila nepromenjena posle accept.
- **Svih prethodnih 15 svita zeleno** (0036 aditivno/omekšavajuće — ništa se ne pomera).
- **i18n svih 30:** novi `onboarding.{title,subtitle,orJoin}` (`sr`/`en` autorski, ostali mašinski); `en` fallback — **0 MISS**.

## PODSETNIK — ručna primena
- **0036 je samo na DEV.** PROD/STAGING (na `0033`) i **0034/0035/0036** čekaju STAGING/PROD uz izričito odobrenje.
- Rollback 0036: `drop function ensure_identity, ensure_worker_public_no, my_worker_public_no;` vrati `app_users_company_by_role` na verziju 0014 (`role='platform_admin' or company_id is not null`); `alter table app_users alter column role set not null;` (uz uslov da nema čistih identiteta — inače ih prvo očisti). Aditivno; stare kolone/politike nedirane.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` (jest) | ✅ 142/142 (21 svita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED (16 svita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ exit 0 |
| i18n 30/30 (en fallback, 0 MISS) | ✅ |
| Link ostao na DEV | ✅ `icbjagubaftoqcwfcbwf` |

**Kvalitet:** slojevi razdvojeni (onboarding dom = tanki kompozit reusable komponenti; pristup bazi kroz api sloj); bez dupliranja (reuse `NetworkProfileEditor`/`NetworkInvites`/`AcceptInviteBox`/`NewCompanyWizard`); definer RPC-ovi jer profili nemaju INSERT politiku; brend/identitet netaknut (BT-D auto, dispečerski broj „po potrebi" — bez izmišljanja `BT-T`, koji je broj ture). Pravila ispoštovana.
