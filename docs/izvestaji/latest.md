# IZVEŠTAJ — ETNOP LOGO „UGRADI SVUDA" (zamena kamiona Evropa dot-map znakom)

> DEV. Novi znak ugrađen na login, boot, splash/ikonicu, PDF fakturu i zaglavlje aplikacije;
> stari kamion-fajlovi obrisani. Identifikatori (package/scheme/BT-D) netaknuti. Provere čiste.

## Zavisnost (SVG)
`react-native-svg@15.12.1` + `react-native-svg-transformer` **već su u app dep** (metro transformer aktivan) →
**ništa novo nije dodato**; `.svg` se uvozi kao komponenta. Tipovi: `src/types/svg.d.ts` (postoji).

## 1) Ekran prijave (mobilni + web)
- Uklonjen stari kamion-wordmark; dodat **`BrandLockup`** = `EtnopMark` (tema-svestan znak) + **ETNOP** + tagline (kroz tokene).
- **Zašto mark + tema-tekst, a ne `etnop-logo-europe.svg` direktno:** taj fajl ima *zapečen svetli tekst* (savršen na tamnoj podlozi) koji bi **nestao na svetloj temi**. Login je tema-varijabilan (Screen koristi `colors.bg`), pa mark + tekst kroz `colors.text` ostaje čitljiv u **light i dark** (pravilo #8). `etnop-logo-europe.svg` se koristi na **boot** ekranu (garantovano tamna podloga).

## 2) Boot / učitavanje
- Novi **`BootScreen`**: fiksna `#0B1220` podloga + **`etnop-logo-europe.svg`** (mapa + ETNOP + tagline) + suptilan spinner + **„Učitavanje…"** (`common.loading`).
- Zamenjuje goli `<ActivityIndicator/>` na **2 mesta** u `app/index.tsx` (glavni `loading` i `CompanyGate` provera statusa).

## 3) Splash + ikonice (PNG) — RASTERIZACIJA JE BILA MOGUĆA
Izvezeno iz `assets/brand/etnop-mark-europe.svg` **dev alatom ImageMagick `convert`** (samo dev; nije app dep):
| Fajl | Dimenzije | Napomena |
|---|---|---|
| `assets/icon.png` | **1024×1024** | puna `#0B1220` (bez alfe) — app ikonica / web favicon |
| `assets/adaptive-icon.png` | **1024×1024** | providan, znak u sigurnoj zoni (~68%) — Android adaptive foreground |
| `assets/splash-icon.png` | **1024×1024** | providan znak — expo-splash-screen |
- `app.config.ts`: `splash.backgroundColor` (+`dark`) i `adaptiveIcon.backgroundColor` **`#0B1F3A` → `#0B1220`**; komentar ikonice osvežen. Putanje fajlova nepromenjene.
- **PNG-ovi NISU potrebni od tebe** — generisani su i vezani. (Ako želiš oštriji anti-aliasing, mogu regenerisati kroz `sharp`/`resvg` — reci; dimenzije ostaju iste.)

## 4) PDF faktura + zaglavlje aplikacije
- **PDF header:** dodat **ETNOP znak** (svetla varijanta, self-contained **data URI** `src/features/invoices/brandMark.ts`) levo od „ETNOP" + tagline. Svetli mark je čitljiv na beloj štampi. Radi u expo-print (mobilni) i browser print (web).
- **Zaglavlje aplikacije (web + mobilni):** mali **ETNOP mark kao `headerLeft`** u deljenim Tabs opcijama (`navOptions.ts`) → prikazuje se u chrome-u owner i driver sekcija (nije bilo brenda u headeru; sada stoji znak).

## 5) Obrisani stari kamion-fajlovi + reference
Obrisano: `logo-horizontal.svg`, `logo-horizontal-dark.svg`, `logo-mark.svg`, `logo-mark-dark.svg`, `logo-mark-mono.svg`, `app-icon.svg`.
`assets/brand/brand.md` **prepisan (v2, ETNOP)** — opisuje novi znak, fajlove, izvedene PNG-ove, izvor/licencu.
**Grep:** nema više nijedne reference na obrisane fajlove ni na `LogoLight/LogoDark`. Preostali „kamion/Truckerz" pomeni su: tip vozila „rigid" („Solo kamion" — domenski termin, ne brend) i identifikatori (`com.brumtruckerz.app`, `scheme`) — **namerno netaknuti**.

## Novi/izmenjeni fajlovi
- NOVO: `src/components/EtnopMark.tsx`, `BrandLockup.tsx`, `BootScreen.tsx`, `BrandHeaderLeft.tsx`, `src/features/invoices/brandMark.ts`.
- IZMENJENO: `app/(auth)/sign-in.tsx`, `app/index.tsx`, `src/components/navOptions.ts`, `src/features/invoices/pdf.ts`, `src/lib/brand.ts` (+brend paleta), `app.config.ts`, `assets/{icon,adaptive-icon,splash-icon}.png`, `assets/brand/brand.md`, `src/locales/*.json` (30 × `common.loading`).

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 121/121 (17 suites) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja — baseline) |
| `expo export --platform web` | ✅ (react-native-svg renderuje na webu) |
| Vizuelna QA ikonice (raster 1024) | ✅ Evropa dot-map, full-bleed, enterprise |

## Jezici
`common.loading` dodat u **svih 30** (sr „Učitavanje…", en „Loading…", ostali mašinski). `en` fallback očuvan; status fajlova nepromenjen; dodata samo vrednost (minimalan diff).

## Kvalitet koda
Znak kroz **deljene komponente** (`EtnopMark`/`BrandLockup`/`BootScreen`/`BrandHeaderLeft`) — bez duplirane logike; boje iz brend paleta konstanti (ne hex u komponenti); bez mrtvog koda (uklonjeni nekorišćeni importi). Identifikatori i BT-D/BT-T netaknuti.

## Napomene
- Ništa funkcionalno nije promenjeno (samo prikaz/brend). **F4 push-finale** i dalje čeka „1a/1b gotovo".
- Za nativne buildove (ikonica/splash na pravom uređaju) treba **novi EAS build** (asset se ugrađuje u binarni paket) — po potrebi, zaseban korak.
