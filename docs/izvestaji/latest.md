# IZVEŠTAJ — „PUSH FINALE": infrastruktura postavljena; proba push-a ČEKA (odluka vlasnika)

> Idempotentno provereno stanje. **Sva push-infrastruktura je na mestu** (google-services uvezan, FCM ključ na expo.dev,
> reminders-cron + CRON_SECRET + raspored na PROD-u, migracija 0026 na PROD-u, novi build sa push-om napravljen).
> **Proba uživo (korak 4) je SVESNO preskočena** na zahtev vlasnika — čeka njegovu odluku o okidaču.
> Nijedna tajna-vrednost nije u ovom izveštaju.

## Status po koraku

| # | Korak | Status | Sledeći klik vlasnika |
|---|---|---|---|
| 1 | `google-services.json` u korenu | **URAĐENO** ✅ | — (projekat `entop-98f50`, package `com.brumtruckerz.app`) |
| 1 | `googleServicesFile` u `app.config.ts` | **URAĐENO** ✅ | — (`./google-services.json`; commit `3819bfe`) |
| 1 | FCM V1 ključ na expo.dev (Credentials → Android) | **URAĐENO** ✅ (vlasnik uploadovao) | — (ključ iz istog projekta `entop-98f50`) |
| 2 | `reminders-cron` deploy @ PROD | **URAĐENO** ✅ | — (`ACTIVE`, `verify_jwt:false`, v1) |
| 2 | CRON_SECRET (PROD secret) | **URAĐENO** ✅ | — (postoji; vrednost se NE čuva van sesije u kojoj je kreirana) |
| 2 | Raspored 07:00 Europe/Belgrade (pg_cron) | **URAĐENO** ✅ | — (`0 5 * * *` UTC; DST: 07:00 CEST leti / 06:00 zimi) |
| 2 | Smoke 401/200 | **URAĐENO** ✅ (ranija sesija) | — (401 bez tajne, 200 sa tajnom) |
| 3 | `db push 0026` @ PROD | **URAĐENO** ✅ | — (`local 0026 = remote 0026`; dry-run bi bio prazan) |
| 4 | **Proba uživo push-a** | **ČEKA** ⏸️ (odluka vlasnika) | vidi „Kako pokrenuti probu" dole |
| C | Novi production build sa push-om | **URAĐENO** ✅ | instaliraj build 6 na telefon (link dole) |

## Novi build (nosi push + ETNOP brend)
🔗 **https://expo.dev/accounts/kikitzas-team/projects/kikitza/builds/71960859-ab1f-4b90-8a1f-ad120f8d97e6**
- Android / `production` (APK), **versionCode 5 → 6** (auto-increment)
- **`google-services.json` ugrađen u paket** → FCM registracija push tokena radi
- remote keystore (`Build Credentials I5m2sqRrSb`), `EXPO_PUBLIC_PHONE_LOGIN=0`

## Provera ove sesije (bez remećenja linka — `--project-ref`, link ostao DEV)
- `google-services.json`: `project entop-98f50`, `package com.brumtruckerz.app` → **MATCH** sa `android.package`.
- `app.config.ts`: `googleServicesFile: "./google-services.json"` prisutan.
- `functions list` (PROD): `reminders-cron` → `ACTIVE`, `verify_jwt:false`.
- `secrets list` (PROD): `CRON_SECRET` prisutan *(prikaz je digest, NE vrednost)*.
- `migration list` (PROD): `local 0026 = remote 0026`.

## Korak 4 — proba uživo: SVESNO ČEKA (odluka vlasnika)
Nije pokrenuta na izričit zahtev vlasnika. Kad poželiš da je uradimo, biraš okidač:

- **Opcija A — 07:00 cron (najverniji, nula diranja PROD tajni):**
  instaliraj build 6, uloguj se (push token se registruje), napravi **rok sa bliskim datumom** na pravoj firmi,
  ostavi preko noći → sutra u 07:00 (Europe/Belgrade) pg_cron sam okine → push stiže kao pravim korisnicima.
- **Opcija B — ručni okidač ODMAH:**
  POST na `reminders-cron` sa `x-cron-secret` headerom. Pošto se `CRON_SECRET` vrednost **ne čuva** van sesije u kojoj
  je kreirana, za trenutni test bih morao da **rotiram** `CRON_SECRET` na PROD-u (nova vrednost + sinhronizacija sa
  pg_cron izvorom) — radim **samo uz tvoje izričito odobrenje** jer dira produkciju.

**Ako meta-rok bude pravljen za probu:** biće to običan reminder sa bliskim datumom na pravoj firmi; posle probe ga
vlasnik ukloni/izmeni kroz „Centar rokova" (Izmeni/Obriši uz potvrdu) — nikakav poseban čist-up nije potreban.

## Šta je preostalo
Samo **korak 4 (proba)**. Cela infrastruktura je spremna; kad javiš izbor (A ili B), zatvaramo „PUSH FINALE".

## Provere
| Provera | Rezultat |
|---|---|
| google-services MATCH + `googleServicesFile` vezan | ✅ |
| reminders-cron / CRON_SECRET / 07:00 raspored @ PROD | ✅ (postoji; nije ponovo diran) |
| 0026 @ PROD | ✅ `remote 0026` |
| Novi build sa push-om (vc 6) | ✅ napravljen |
| Link ostao na DEV | ✅ (`icbjagubaftoqcwfcbwf`) |
| i18n | nije diran |
| Tajne u izveštaju | ✅ nijedna vrednost (samo imena/mesta) |
