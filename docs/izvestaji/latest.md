# IZVEŠTAJ — „PUSH FINALE" nastavak + nov build (ETNOP splash/ikonica + push)

> **Radi idempotentno:** prvo verifikovano stanje, pa nastavak. **Backend je kompletan.** Jedini blokator je
> **Firebase `google-services.json`** — fajl koji **samo vlasnik** može da preuzme i prevuče u koren repoa.
> Dok ga nema: `googleServicesFile` se NE vezuje (put ka nepostojećem fajlu bi polomio build), a produkcioni
> build se NE pokreće (bez FCM ključa push ne bi radio — a poenta ovog builda je da push konačno radi na uređaju).

## Status po koraku

| # | Korak | Status | Sledeći potez |
|---|---|---|---|
| 1 | Firebase `google-services.json` u korenu | **NIJE** ⛔ | Vlasnik: konzola → preuzmi → prevuci u koren (koraci dole) |
| 1 | FCM V1 service account ključ na expo.dev | **NIJE potvrđeno** ⛔ | Vlasnik: upload na expo.dev → Credentials → Android (koraci dole) |
| 1 | `googleServicesFile` u `app.config.ts` | **NIJE** (čeka fajl) | Ja vezujem ČIM fajl bude u korenu → commit „push: google-services wired" |
| 2 | `reminders-cron` deploy na PROD | **URAĐENO** ✅ | — (`ACTIVE`, `verify_jwt:false`, verz. 1) |
| 2 | CRON_SECRET (PROD secret) | **URAĐENO** ✅ | — (postoji; smoke 401/200 prošao u F4 backend sesiji) |
| 2 | Raspored 07:00 Europe/Belgrade (pg_cron) | **URAĐENO** ✅ (prethodna sesija) | pg_cron: `0 5 * * *` UTC = 07:00 CEST leti / 06:00 zimi (DST napomena) |
| 3 | `db push 0026` na PROD (samo indeksi) | **URAĐENO** ✅ | — (`remote 0026`; dry-run bi bio prazan) |
| 4 | Nov production build (ETNOP splash/ikonica + push) | **ČEKA korak 1** ⛔ | Pokrećem `eas build … --profile production` čim je `google-services.json` u korenu |

## Dokazi iz provere (ova sesija, bez remećenja linka — `--project-ref`)
- `supabase functions list` (PROD): `reminders-cron` → `status: ACTIVE`, `verify_jwt: false`, `version: 1`.
- `supabase migration list` (PROD): `local 0026 = remote 0026`.
- `supabase secrets list` (PROD): `CRON_SECRET` prisutan *(prikaz je SHA-digest, NE vrednost — tajna se ne izlaže)*.
- Link ostao na **DEV** (`icbjagubaftoqcwfcbwf`) sve vreme (koristio `--project-ref`, bez `link`).

## Korak 1 — VLASNIK, klik po klik (jedino što blokira sve ostalo)

**1a) `google-services.json` (SME u git):**
1. https://console.firebase.google.com → **Add project** (ako projekat još ne postoji) → ime npr. **„ETNOP"** → dovrši (Analytics opciono).
2. U projektu: **Add app → Android** (ikonica ▲/Android).
3. **Android package name:** `com.brumtruckerz.app` **(TAČNO ovako — to je trajni identifikator, NIJE brend).**
4. Nadimak/SHA-1 nisu obavezni za FCM → **Register app**.
5. **Download `google-services.json`**.
6. Prevuci fajl u **koren repoa** (`/workspaces/BrumTruckerz/google-services.json`). Javi „1a gotovo".

**1b) FCM V1 service account ključ (NIKAD u git ni u izveštaj):**
1. Firebase konzola → ⚙️ **Project settings → Service accounts**.
2. **Generate new private key** → potvrdi → preuzima se JSON (drži ga LOKALNO, van repoa).
3. https://expo.dev → projekat **kikitza** → **Credentials → Android → FCM V1** → **Upload** taj JSON.
4. Javi „1b gotovo".

> Kad javiš „1a gotovo": vežem `googleServicesFile: "./google-services.json"` u `android` bloku `app.config.ts`,
> provere + commit „push: google-services wired", pa (uz „1b gotovo" i tvoju potvrdu za build) pokrećem
> `eas build --platform android --profile production` (versionCode auto-increment; `EXPO_PUBLIC_PHONE_LOGIN` ostaje `0`).
> Link builda ide u sledeći izveštaj (bez ijedne tajne).

## Napomena — build i splash/ikonica
`expo-splash-screen` i ikonica se **peku u nativni paket u build-vremenu**. Novi ETNOP splash + Evropa ikonica
stižu na uređaj **tek s ovim novim buildom** (postojeći instaliran paket je pre-rebrand → otud „stari kamion").
Ako želiš ranu vizuelnu potvrdu splash/ikonice **pre** Firebase-a, mogu `--profile preview` (APK, isti asseti) —
ali taj build **nema push**; „PUSH FINALE" build je i dalje `production` posle koraka 1.

## Provere (ova sesija)
| Provera | Rezultat |
|---|---|
| Verifikacija PROD backend (functions/migration/secrets) | ✅ sve prisutno |
| Link ostao na DEV | ✅ (`icbjagubaftoqcwfcbwf`) |
| Izmene koda | nema (čeka `google-services.json`) |
| i18n | nije diran |
| Pravila kvaliteta | ispoštovana (bez vezivanja na nepostojeći fajl; bez pokretanja builda bez preduslova) |
