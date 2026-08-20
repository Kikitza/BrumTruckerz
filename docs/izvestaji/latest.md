# IZVEŠTAJ — F3: DESKTOP TABELE + KALENDAR

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Web export prolazi bez grešaka; mobilno netaknuto.

## Izmene (spisak)
- **KALENDAR (web):** `DateField` web grana prelazi sa tekst-unosa na **`<input type="date">`** (ugrađeni browser kalendar,
  bez novih biblioteka; kroz `createElement("input", …)` da native ostane netaknut). Vrednost je „YYYY-MM-DD" — isti format.
- **`src/components/DataTable.tsx`** (novo) — reusable tabela (zaglavlje, red sa **hover**-om, klik → postojeći detalj/modal;
  sortiranje samo za kolone koje daju `sort` — trivijalno, datum/naziv). Generička (`Column<T>`).
- **`src/lib/platform.ts`** — `useWideWeb(min=900)` hook (tabele se uključuju samo na webu ≥ ~900px).
- **4 ekrana** dobijaju desktop tabelu (u `DesktopContainer`; **maxWidth 1200–1240** — tabele traže više horizontalnog
  prostora od kartica, pa širi kontejner; ispod ~900px i na native-u **ostaju postojeće kartice 1:1**):
  - **TURE** — relacija, naručilac, vozač, vozilo, status, vozarina (office), datum. (nov `ownerListTripsRich` sa embedovanim imenima/vozarinom)
  - **FAKTURE** — broj, naručilac, izdata, rok, iznos, **status-bedž** (KASNI crveno).
  - **NARUČIOCI** — naziv, PIB (+**VIES ✓**), rok plaćanja, broj tura, status.
  - **FLOTA (vozila)** — registracija, tip, kilometraža, **bedž rokova** (najgori od date/km po vozilu, semafor tačka).
- **`src/locales/*.json`** (svih 30) — nova zaglavlja: `trip.table.*`, `invoice.table.*`, `customers.table.*`, `fleet.table.reminders`.

## Odluke / obrazloženje (pravilo 5)
1. **`<input type="date">` umesto biblioteke** — ugrađeni browser kalendar (bez težih zavisnosti, tražено u zadatku);
   native koristi postojeći `@react-native-community/datetimepicker` (netaknuto).
2. **maxWidth tabela 1200–1240** (vs 1000 za kartice): tabela sa 5–7 kolona je čitljivija sa više širine, a i dalje
   centrirana (ne razvučena preko celog 4K ekrana). Obrazloženo po proceni.
3. **Prag 900px**: ispod toga (uzak browser/tablet portret) i na native-u ostaju kartice — tabela nema smisla na uskom.
4. **Sortiranje v1 samo trivijalno** (naziv/datum/relacija/broj) — bez kompleksnog multi-sort; klik na zaglavlje sortabilne kolone.
5. **Ture: zaseban rich upit** (`ownerListTripsRich`) samo kad je tabela aktivna (`enabled: wide`) — mobilni koristi lagani `ownerListTrips` (bez izmene mobilnog toka).

## Test matrica (ništa mobilno pokvareno)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 17 suita / 121 test |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja) |
| `npm run test:db` | ✅ nepromenjeno (bez DB izmena) |
| `expo export --platform web` | ✅ bez grešaka |
| Expo Go (native) | ✅ nedirnuto — `useWideWeb` je false na native (kartice + nativni date picker) |

## Migracije / deploy
- **Nema migracija / Edge / Auth.** Čisto klijentski. `dist/` u `.gitignore`.

## Jezici
i18n **dopunjen u SVIH 30 jezika** — 9 novih zaglavlja tabela (`route/status/revenue/date`, `no/status`, `trips/status`,
`reminders`). `sr`/`en` autorski; 28 mašinski. `en` potpun (fallback).

## Mapa (ažurirano)
- Desktop tabele (ture/fakture/naručioci/flota) → ✅ RADI; kalendar (web) → ✅ RADI.
- Ostaje: web-kompresija slika; desktop poliranje preostalih ekrana (rokovi/izveštaji/podešavanja) po potrebi.

## Kvalitet koda
Reusable `DataTable` + `DesktopContainer` (jedan okvir za sve desktop ekrane); grane kroz `platform.ts`; klik na red vodi
u **isti postojeći modal** (bez duplirane logike detalja); native 1:1 očuvan. **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. Živa proba u browseru (`npx expo start --web`) na širokom ekranu: tabele na 4 ekrana + kalendar u formama.
2. Sledeće po potrebi: web-kompresija slika; tabele/poliranje preostalih ekrana.
