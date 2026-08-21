# IZVEŠTAJ — „PUSH FINALE": KOMPLETNA FIREBASE PROCEDURA (korak po korak)

> Cilj: da obaveštenja (push) rade na pravom telefonu. Backend je već gotov (cron/secret/migracija) — nedostaje
> samo **Firebase veza**. Ovo je cela procedura od nule. Delovi označeni **[VLASNIK]** radiš ti u browseru;
> **[JA]** radim ja u repou posle tvoje potvrde.
>
> **Dva fajla, dva različita pravila:**
> - `google-services.json` → **SME u git** (nije tajna; identifikuje app kod Firebase-a).
> - Service-account **privatni ključ** (JSON iz „Service accounts") → **NIKAD u git ni u izveštaj** (to je tajna).

---

## DEO A — Napravi Firebase projekat i preuzmi `google-services.json`  **[VLASNIK]**

### A1. Uloguj se
1. Otvori **https://console.firebase.google.com**
2. Uloguj se Google nalogom (isti koji koristiš za projekat).

### A2. Napravi projekat
3. Klikni **Add project** (ili **Create a project**).
4. **Project name:** upiši **`ETNOP`** → **Continue**.
5. **Google Analytics for this project:** prekidač možeš **isključiti (Disable)** — nije potreban za push → **Continue** / **Create project**.
6. Sačekaj „Your new project is ready" → **Continue**. Otvara se **Project Overview**.

### A3. Dodaj Android aplikaciju
7. Na Project Overview klikni **Android** ikonicu (ili **Add app → Android**).
8. **Android package name:** upiši **TAČNO**:
   ```
   com.brumtruckerz.app
   ```
   ⚠️ Mora baš ovako (mala slova, tačke). To je trajni tehnički identifikator aplikacije — **nije brend** i **ne menja se**. Ako pogrešiš i jedno slovo, push neće raditi.
9. **App nickname (optional):** možeš upisati „ETNOP" ili ostaviti prazno.
10. **Debug signing certificate SHA-1 (optional):** **preskoči** (nije potrebno za push).
11. Klikni **Register app**.

### A4. Preuzmi konfiguracioni fajl
12. Na koraku „Download config file" klikni **Download google-services.json**.
13. Sledeće ekrane („Add Firebase SDK", „Next steps") **preskoči** — klikni **Next → Next → Continue to console**. (Mi ne diramo Gradle ručno; Expo to radi kroz plugin.)

### A5. Stavi fajl u repo
14. Prevuci preuzeti **`google-services.json`** u **koren repoa**:
    ```
    /workspaces/BrumTruckerz/google-services.json
    ```
    (baš u koren, pored `app.config.ts` — ne u podfolder).
15. **Javi mi: „1 gotovo".**

> **[JA] posle „1 gotovo":** vežem `googleServicesFile: "./google-services.json"` u `android` blok `app.config.ts`,
> pokrenem provere (typecheck/test/lint) i commit-ujem „push: google-services wired".

---

## DEO B — FCM V1 service-account ključ na expo.dev  **[VLASNIK]**

> Ovo je *drugi* fajl (privatni ključ) — Expo ga koristi da Firebase-u dokaže „ja smem da šaljem push za ovu app".
> **Taj JSON je TAJNA — čuvaj ga lokalno, NIKAD u git ni u poruke.**

### B1. Generiši privatni ključ u Firebase-u
1. U Firebase konzoli (isti „ETNOP" projekat) klikni **⚙️ (Settings) → Project settings**.
2. Otvori tab **Service accounts**.
3. Klikni **Generate new private key** → u dijalogu **Generate key**.
4. Preuzima se JSON fajl (npr. `etnop-xxxxx-firebase-adminsdk-....json`). **Sačuvaj ga na svom računaru, izvan repoa.**

### B2. Uploaduj ga na Expo
5. Otvori **https://expo.dev** i uloguj se.
6. Idi na projekat **kikitza** (nalog `kikitzas-team`).
7. Levi meni: **Credentials**.
8. Izaberi platformu **Android** (Application identifier `com.brumtruckerz.app`).
9. Nađi sekciju **FCM V1 service account key** → **Add a service account key** / **Upload**.
10. Izaberi JSON iz koraka B1 → potvrdi upload.
11. **Javi mi: „2 gotovo".**

> Ako već postoji uploadovan FCM V1 ključ — samo javi „FCM već postoji" i preskačemo B.

---

## DEO C — Novi build da push uđe u aplikaciju  **[JA, uz tvoju reč]**

> `google-services.json` se **ugrađuje u binarni paket u build-vremenu** — postojeća instalirana app ga nema,
> pa push ne radi dok se ne napravi **nov build** posle DEO A.

1. **[JA]** pokrećem:
   ```
   eas build --platform android --profile production
   ```
   (versionCode se auto-increment-uje: 5 → 6; `EXPO_PUBLIC_PHONE_LOGIN` ostaje `0`).
2. **[JA]** stavljam **link builda** u izveštaj (bez tajni).
3. **[VLASNIK]** kad build završi (link → **Install**) → instaliraj APK na telefon → otvori app bar jednom (da se registruje push token).

---

## DEO D — Proba uživo (rok → push na telefon)  **[JA + VLASNIK]**

1. **[VLASNIK]** na pravoj firmi napravi/izmeni jedan **rok (reminder)** sa **bliskim datumom** (da upadne u prag opomene), i uveri se da si ulogovan na telefonu sa tim nalogom (push token registrovan).
2. **[JA]** okidam **ručni test** reminders-cron funkcije (`x-cron-secret` header = CRON_SECRET) — očekivano **HTTP 200** i push na telefon. *(Biram ručni okidač umesto čekanja 07:00 cron-a jer je proba trenutna; cron ostaje netaknut za svakodnevni rad.)*
3. **[VLASNIK]** potvrdi da je **notifikacija stigla** na telefon.
4. **[JA]** upisujem rezultat probe u izveštaj (poslato/scanned/due brojke, bez tajni).

---

## Trenutni status po koraku (idempotentno provereno ove sesije)

| # | Korak | Status |
|---|---|---|
| A | `google-services.json` u korenu | **NIJE** ⛔ — čeka DEO A |
| A | `googleServicesFile` u `app.config.ts` | **NIJE** (čeka fajl) |
| B | FCM V1 ključ na expo.dev | **NIJE potvrđeno** ⛔ — čeka DEO B |
| C | Build sa push-om (versionCode 6) | **ČEKA DEO A** ⛔ |
| D | Proba uživo | **ČEKA DEO C** ⛔ |
| — | reminders-cron deploy @ PROD | **URAĐENO** ✅ (`ACTIVE`, `verify_jwt:false`) |
| — | CRON_SECRET @ PROD | **URAĐENO** ✅ (postoji; smoke 401/200 ranije) |
| — | Raspored 07:00 Europe/Belgrade | **URAĐENO** ✅ (`0 5 * * *` UTC; DST: 07:00 CEST leti / 06:00 zimi) |
| — | `db push 0026` @ PROD | **URAĐENO** ✅ (`remote 0026`) |

**Napomena:** brend-build (versionCode 5, ETNOP ikonica/splash) je već pokrenut ranije, ali **bez push-a**.
Ovaj „PUSH FINALE" build (DEO C, versionCode 6) je sledeći i donosi funkcionalan push.

## Provere ove sesije
| Provera | Rezultat |
|---|---|
| Verifikacija PROD backend (functions/secrets/migration) | ✅ sve prisutno |
| Link ostao na DEV | ✅ (`icbjagubaftoqcwfcbwf`) |
| Izmene koda | nema (čeka `google-services.json`) |
| i18n | nije diran |
| Tajne u izveštaju | ✅ nijedna vrednost (samo imena/mesta) |
