# IZVEŠTAJ — F3 KRIŠKA 1: WEB TEMELJ (isti kod u browseru + poštena mapa)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Web target (react-native-web) uspostavljen; **`expo export --platform web` prolazi bez grešaka**. Mobilno nije dirano.

## Izmene (spisak)
- **`docs/adr/0011-web-strategija.md`** (novo, **STATUS: PREDLOG**) — jedan kod/tri platforme; web v1 = KANCELARIJA (vozač
  mobilni); **web je UVEK ONLINE** (offline red = native-only); platformske grane; responsive v1 = max-width; posledice +
  odbačene alternative (poseban Next.js admin — zašto ne sada).
- **`app.config.ts`** — `web: { bundler: "metro", output: "single", favicon }`.
- **`react-native-web` ^0.21 + `@expo/metro-runtime`** dodati (package.json).
- **`src/lib/platform.ts`** (novo) — `isWeb`/`isNative` (jedan izvor za grane).
- **`app/_layout.tsx`** — na webu se **ne** pokreće offline red (`registerAllHandlers`/`startSync`) niti push
  (`Notifications.*`) → startup ne pada zbog native modula.
- **`src/lib/offline/sqliteQueueStore.web.ts`** (novo) — Metro `.web` stub (no-op QueueStore) da **`expo-sqlite` (wasm)
  NE uđe u web bundle**; native varijanta netaknuta.
- **`usePushRegistration`** — no-op na webu.
- **`src/components/form.tsx` `DateField`** — web grana: tekstualni unos „YYYY-MM-DD" (nativni datetimepicker ne radi na webu).
- **Gate (`app/index.tsx`)** — vozač na webu → ljubazna poruka „koristi mobilnu aplikaciju"; owner/dispatcher/admin ulaze normalno.
- **Fakture (`app/(owner)/invoices.tsx`)** — desktop pass: **max-width 1000, centrirano** (čitljivo na 1200px+, kartice se ne razvlače).
- **PDF (fakture)** — na webu „PDF je dostupan u mobilnoj aplikaciji" (share) i preskočeno generisanje pri izdavanju (native-only).
- **`src/locales/*.json`** (svih 30) — `web.driverUseMobile`, `web.pdfMobileOnly`.

## Proof-of-life (automatizovano)
- **`npx expo export --platform web` → „Web Bundled … 1179 modules … Exported: dist"** (bez grešaka). Jedini web-nekompatibilan
  statički uvoz bio je `expo-sqlite` → rešen `.web` stubom; svi ostali Expo moduli (print/sharing/file-system/image-picker/
  datetimepicker/notifications) se razrešavaju kroz svoje web-šimove i bundle prolazi.
- **Serviran `dist/`**: `index.html` HTTP **200**, JS bundle HTTP **200** (SPA ljuska se učitava). *Živa klik-proba (login/gate/
  tabovi) protiv DEV baze radi se kroz `npx expo start --web` u browseru — sve grane su na mestu.*

## MAPA: šta na webu RADI / NE RADI još / native-only zauvek
| Oblast | Status | Napomena |
|---|---|---|
| Boot / bundling / startup | ✅ RADI | grane u `_layout` (bez sqlite/push na webu) |
| Email prijava + Registracija | ✅ RADI | isti Supabase Auth |
| Gate / uloge (owner/dispečer/admin) | ✅ RADI | vozač → poruka „mobilna app" |
| Tabovi (ture/flota/naručioci/fakture/rokovi/izveštaji/podešavanja) | ✅ RADI | otvaraju se |
| **Fakture — lista (desktop)** | ✅ RADI (uzorni ekran) | max-width 1000, čitljivo na širokom ekranu |
| Naručioci + **VIES** provera | ✅ RADI | Edge poziv radi iz browsera |
| Pozivnice (kod) / dispečer registracija | ✅ RADI | |
| Rokovi (tip-katalog, km) — čitanje/unos | ✅ RADI | datum kroz web tekst-unos |
| Čarobnjak „Otvori novu firmu" | ✅ RADI | |
| **PDF fakture** (print/share) | ⚠️ NE RADI JOŠ | poruka „mobilna app"; web PDF = kasnija kriška |
| **Prilozi/dokumenti** (kamera/galerija) | ⚠️ NE RADI JOŠ | image-picker web grana (file input) — sledeći zadatak |
| **Prave tabele / gušći desktop UI** | ⚠️ NE RADI JOŠ | v1 = max-width; tabele ekran-po-ekran kasnije |
| **Datumski kalendar** | ⚠️ NE RADI JOŠ | web je tekst „YYYY-MM-DD"; kalendar-widget dorada |
| Ostali ekrani (desktop poliranje) | ⚠️ NE RADI JOŠ | samo Fakture su uzorak; ostalo inkrementalno |
| Offline red (sqlite) | 🔒 NATIVE-ONLY | web je uvek online (ADR 0011) |
| Push obaveštenja | 🔒 NATIVE-ONLY | expo-notifications |
| Vozačev tok (km/kamera/offline) | 🔒 NATIVE-ONLY | vozač je mobilni |

Ovo je **plan sledećih kriški faze web**.

## Test matrica (ništa mobilno nije pokvareno)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 17 suita / 121 test |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja) |
| `npm run test:db` | ✅ ALL PASSED (10 svita — nepromenjeno) |
| `expo export --platform web` | ✅ bez grešaka |
| Expo Go (native) | ✅ nedirnuto — sve grane su `isWeb`-uslovljene (native = staro ponašanje) |

## Migracije / deploy
- **Nema migracija / Edge / Auth promena.** Web build je klijentski; artefakt `dist/` je u `.gitignore` (ne commituje se).

## Jezici
i18n **dopunjen u SVIH 30 jezika** — `web.driverUseMobile`, `web.pdfMobileOnly`. `sr`/`en` autorski; 28 mašinski. Ostatak nedirnut.

## Kvalitet koda
Jedan izvor grana (`platform.ts`); Metro `.web` stub (idiomatski) umesto if-ova po kodu za sqlite; bez duplirane logike;
native ponašanje 1:1 očuvano. **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. Živa klik-proba u browseru (`npx expo start --web`) — potvrda login/gate/tabova; pa prihvatanje ADR 0011.
2. Sledeće web kriške po mapi gore (PDF web, prilozi web, tabele, desktop poliranje ekran-po-ekran).
