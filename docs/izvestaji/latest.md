# IZVEŠTAJ — WEB DORADA „BELE IVICE" (full-bleed tema + DesktopContainer)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Web export prolazi bez grešaka; mobilno netaknuto.

## Uzrok
Na `/invoices` je centriran `max-width` kontejner imao boju teme SAMO unutar 1000px; **spoljna podloga (bočne
margine) je ostajala bela** (default `body`/root). `/trips` je bio ceo taman jer mu root View puni celu širinu temom.

## Izmene (spisak)
- **`src/components/DesktopContainer.tsx`** (novo) — reusable omotač: **SPOLJNI sloj `flex:1` + `backgroundColor`
  aktivne teme preko CELE širine**; UNUTRA centriran `maxWidth` (1000). Na native/uskim ekranima providan (samo
  flex:1 sa temom) → ponaša se kao običan ekran. Ubuduće ga koriste svi desktop-pass ekrani.
- **`app/(owner)/invoices.tsx`** — root zamenjen `DesktopContainer`-om (spoljni sloj farba ivice, unutra lista); uklonjen
  raniji inline `maxWidth` (koji je bio uzrok belih ivica).
- **`app/_layout.tsx`** — **globalno za web**: `useEffect` postavlja `document.documentElement`/`body` `backgroundColor`
  = boja pozadine aktivne teme (svetla/tamna), reaguje na promenu teme → **nijedan ekran nikad ne pokaže belo van sadržaja**.
  Guard `isWeb && typeof document !== "undefined"` (native/SSR bezbedno).

## Test matrica (mobilno netaknuto)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 17 suita / 121 test |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja) |
| `npm run test:db` | ✅ nepromenjeno (bez DB izmena) |
| `expo export --platform web` | ✅ bez grešaka |
| Expo Go (native) | ✅ nedirnuto — `DesktopContainer` je na native providan (flex:1 sa temom) |

## Migracije / deploy
- **Nema migracija / Edge / Auth.** Čisto klijentski web fix. `dist/` u `.gitignore`.

## Jezici
i18n **nije diran** (nema novih stringova).

## Kvalitet koda
Reusable `DesktopContainer` (jedan izvor za desktop okvir; sledeći ekrani ga koriste); globalna web podloga na jednom
mestu (`_layout`); bez duplirane logike; native ponašanje očuvano. **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. Živa klik-proba u browseru (`npx expo start --web`) — potvrda da su ivice sada obojene temom na `/invoices` (i svuda).
2. Sledeće web kriške po mapi iz prethodne kriške (PDF web, prilozi web, tabele, desktop poliranje ekran-po-ekran uz `DesktopContainer`).
