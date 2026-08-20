# IZVEŠTAJ — KAPIJA F2 / KORAK 2: PREKIDAČ ZA TELEFON + NOV PRODUKCIONI BUILD

> STATUS: **URAĐENO.** Flag za telefon dodat i commitovan; **produkcioni EAS build pokrenut** (PROD okruženje).
> Provere čiste. Nijedan token u izveštaju.

## 1) Prekidač za prijavu telefonom (feature flag)
- **`EXPO_PUBLIC_PHONE_LOGIN`** u `eas.json`: **preview = `'1'`**, **production = `'0'`**.
- **`src/features/auth/phone.ts`** — čista fn `isPhoneLoginEnabled(flag)` (samo `'1'` uključuje) + jest.
- **`app/(auth)/sign-in.tsx`** — segment „Telefon" i sve telefonske staze (`PhoneSignIn`) vidljivi **SAMO kad je flag
  `'1'`**. Kad je isključen: prikazuje se samo email prijava; `effectiveMethod` forsira „email" (nema načina da se dođe do
  telefona). **Email prijava + „Registracija" (dispečer/samouslužno) ostaju SVIMA**, bez obzira na flag.
- Aktivacija SMS-a kasnije = postavi flag na `'1'` (uz „Aktivacija SMS-a na produkciji" iz `RUNBOOK.md`).

## 2) Provere
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 17 suita / 121 test (uklj. `isPhoneLoginEnabled`) |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja) |
| `eas.json` | ✅ validan JSON |
| commit/push | ✅ `6bce79a` „auth: phone login behind flag…" |

## 3) Produkcioni build (EAS)
- Komanda: `eas build --platform android --profile production` (APK, PROD okruženje `uwphmxxeuggitssdmgcz`).
- EAS potvrdio učitane varijable **iz `production` profila**: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  **`EXPO_PUBLIC_PHONE_LOGIN` (= `0`)** → **telefon je u ovom buildu SKRIVEN**.
- `versionCode` uvećan **3 → 4** (autoIncrement, remote appVersionSource); Keystore sa Expo servera (postojeći).
- **Link builda (APK se pojavljuje po završetku):**
  `https://expo.dev/accounts/kikitzas-team/projects/kikitza/builds/77bd5047-582b-47b0-a0e8-0524c1bc4e61`
- Status u trenutku izveštaja: **u redu / gradi se** — stranica prati do završetka i nudi APK za preuzimanje.

> EXPO_TOKEN je bio prisutan i autentikovan (`kikitzatv@proton.me`) → build pokrenut bez zastoja. (Da je falio: token se
> pravi na expo.dev → Account Settings → Access Tokens → „Create token"; unosi se kao `EXPO_TOKEN`.)

## Šta ovaj build PRVI PUT nosi na pravu (produkcionu) aplikaciju
Pošto je PROD baza sada na 0001–0025 (Korak 1), ovaj build **prvi put** aktivira ceo F1+F2 sloj na produkciji:
- **Pozivnice firme** — vlasnik/dispečer generiše kod; primalac ulazi „Imam kod firme" (`accept_invitation`).
- **Dispečer** — uloga po matrici + **email „Registracija"** (samouslužni ulaz naloga).
- **Naručioci (kartoteka klijenata) + VIES provera PIB-a** (Edge `vies-check` deploy-ovana na PROD u Koraku 1).
- **Fakture v1** — brojevi po firmi, PDF (expo-print/sharing), statusi plaćeno/KASNI/storno.
- **Rokovi: šifarnik tipova po struci + servis po kilometraži** (semafor km). *Napomena:* km push-opomene krenu tek po
  redeployu `reminders-cron` na PROD (Korak 3, svesno odloženo).
- **Čarobnjak „Otvori novu firmu"** — samouslužno otvaranje (`create_company_self`) + ISO države + tipovi vozila.

## Namerno SKRIVENO u ovom (produkcionom) buildu
- **Prijava telefonom** — `EXPO_PUBLIC_PHONE_LOGIN='0'`. Ostaje isključena dok se SMS ne aktivira (RUNBOOK), pa se uključuje
  jednim flagom bez izmene koda. (Preview build je `'1'` — telefon vidljiv za internu probu sa test brojevima.)

## Jezici
i18n **nije diran** (flag + build).

## ČEKA SE (potez vlasnika)
1. Preuzmi/instaliraj APK sa build linka kad se završi; probaj na pravom telefonu.
2. **KAPIJA F2 / KORAK 3** (kad odlučiš): `functions deploy reminders-cron` na PROD (km push-opomene).
3. Aktivacija SMS-a na produkciji (RUNBOOK) + `EXPO_PUBLIC_PHONE_LOGIN='0'→'1'` u production profilu — kad se krene sa telefonom.
