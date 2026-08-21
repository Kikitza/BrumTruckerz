# IZVEŠTAJ — „PUSH FINALE" (Firebase / obaveštenja) — nastavak

> **Idempotentna provera:** backend (cron/secret/migracija) je **gotov od ranije**. Sve preostalo (FCM ključ,
> build sa push-om, proba uživo) **čeka jedan fajl** — `google-services.json` — koji **samo vlasnik** može da preuzme.
> `googleServicesFile` se NE vezuje dok fajl fizički ne postoji (put ka nepostojećem fajlu ruši build).

## Status po koraku

| # | Korak | Status | Sledeći klik vlasnika |
|---|---|---|---|
| 1 | `google-services.json` u korenu | **NIJE** ⛔ | Firebase konzola → Add project „ETNOP" → Add app Android `com.brumtruckerz.app` → Download → prevuci u koren (koraci dole) |
| 1 | `googleServicesFile` u `app.config.ts` | **NIJE** (čeka fajl) | Ja vežem ČIM fajl bude u korenu → commit „push: google-services wired" |
| 2 | FCM V1 ključ na expo.dev | **NIJE potvrđeno** ⛔ | Project settings → Service accounts → Generate key → upload na expo.dev → Credentials → Android → FCM V1 |
| 3 | `reminders-cron` deploy @ PROD | **URAĐENO** ✅ | — (`ACTIVE`, `verify_jwt:false`) |
| 3 | CRON_SECRET (PROD secret) | **URAĐENO** ✅ | — (postoji; smoke 401/200 u F4 backend sesiji) |
| 3 | Raspored 07:00 Europe/Belgrade (pg_cron) | **URAĐENO** ✅ | — (`0 5 * * *` UTC = 07:00 CEST leti / 06:00 zimi) |
| 4 | `db push 0026` @ PROD | **URAĐENO** ✅ | — (`remote 0026`; dry-run prazan) |
| 5 | Nov production build sa push-om | **ČEKA korak 1** ⛔ | Pokrećem ČIM je `google-services.json` uvezan |
| 6 | Proba uživo (rok → push na telefon) | **ČEKA korak 5** ⛔ | Posle instalacije builda: ručni test-okidač reminders-cron (200) ili sačekati 07:00 cron |

## Provera ove sesije (bez remećenja linka — `--project-ref`, link ostao DEV)
- `functions list` (PROD): `reminders-cron` → `ACTIVE`.
- `secrets list` (PROD): `CRON_SECRET` prisutan *(prikaz je digest, NE vrednost)*.
- `migration list` (PROD): `local 0026 = remote 0026`.
- `google-services.json`: **nema** u korenu; `app.config.ts` bez `googleServicesFile`.

## Korak 1 — VLASNIK, klik po klik (blokira sve ostalo)
1. https://console.firebase.google.com → **Add project** → ime **`ETNOP`** → (Google Analytics može **off**) → **Create project**.
2. **Add app → Android**.
3. **Android package name:** `com.brumtruckerz.app` **(TAČNO ovako — trajni identifikator, nije brend).**
4. Nickname/SHA-1 preskoči → **Register app**.
5. **Download `google-services.json`**.
6. Prevuci u **koren repoa** (`/workspaces/BrumTruckerz/google-services.json`) → javi **„1 gotovo"**.

## Korak 2 — VLASNIK (JSON NIKAD u git ni u izveštaj)
1. Firebase ⚙️ **Project settings → Service accounts → Generate new private key** (drži lokalno).
2. https://expo.dev → projekat **kikitza** → **Credentials → Android → FCM V1** → **Upload** JSON → javi **„2 gotovo"**.

## Šta ja radim posle potvrda
- „1 gotovo" → vežem `googleServicesFile`, provere, commit „push: google-services wired".
- „2 gotovo" + reč za build → `eas build --platform android --profile production` (versionCode auto +1, telefon flag `0`); link u izveštaj.
- Posle instalacije → proba uživo: ručni test-okidač `reminders-cron` (`x-cron-secret` → očekivano `200` + push), ili sačekati 07:00 cron; obrazložiću izbor.

## Napomena — brend build
Prethodni **brend-build** (versionCode 5) je već pokrenut i nosi ETNOP ikonicu/splash, ali **bez push-a**
(bez `google-services.json`). Ovaj „PUSH FINALE" build (posle koraka 1) biće **sledeći** i doneće funkcionalan push.

## Provere
| Provera | Rezultat |
|---|---|
| Verifikacija PROD backend | ✅ cron/secret/0026 prisutni |
| Link ostao na DEV | ✅ |
| Izmene koda | nema (čeka `google-services.json`) |
| i18n | nije diran |
| Tajne u izveštaju | ✅ nijedna vrednost |
