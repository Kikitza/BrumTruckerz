# IZVEŠTAJ — v2-1b: „ZEMLJE KROZ KOJE JE VOZIO" (geografija ture → CV mapa)

> Nastavak karijernog profila. Pristup: **AUTO pokušaj + RUČNA potvrda**. Commit `9d07c4d` (push-ovan).

## 1) Migracija 0028 (na DEV)
- **`trip_stops.country_code`** + **`trip_stops.country_source`** (`'auto'|'manual'|null`) — zemlja svake stanice.
- **`trips.origin_country_code`** + **`trips.origin_country_source`** — zemlja **polaznog mesta** (origin je tekst na `trips`, nije stanica; destinacija = poslednji istovar → njena zemlja je u `trip_stops`).
- FK → `countries(code)` (41 ISO kod, `0025`). **Postojeće ture ostaju `null`** (legalno; CV pokazuje samo poznato).
- **`career_countries(p_user)`** RPC (SECURITY DEFINER): distinct zemlje iz origin+stanica tura radnika, sa brojem tura po zemlji; **ista privatnost** kao ostatak CV-a (self = sve firme; office = samo svoja firma).

## 2) Auto-detekcija (čista fn, bez plaćenih servisa) — `src/features/trips/countryDetect.ts`
- `detectCountry(place) → { code, confident }`. Redosled: (1) eksplicitan kod na kraju („…, DE" / „(IT)" / „Beograd - RS"); (2) ime zemlje (varijante sr/en/de, bez dijakritike); (3) poznat veliki grad (rečnik ~200 gradova EU/Balkan).
- **NE nagađa na silu:** kad nije jasno → `{ null, false }` (ostaje za ručnu potvrdu). `country_source='auto'` se upisuje **samo** za `confident`.

## 3) UI na turi (Nova/Izmeni) — auto-predlog + ručni izbor
- Svaka stanica (`StopsEditor`) i **polazno mesto** (`NewTripModal`, `TripDetailModal` route-edit) dobijaju polje **„Zemlja"** (`CountryPickerField` sa pretragom).
- Kucanje mesta → auto-predlog (source `auto`); korisnik može promeniti (→ `manual`, konačno — ne pregazuje se). Nesiguran predlog → prazno + suptilni nagoveštaj „Izaberi zemlju".
- **Prazno NE blokira čuvanje** ture. Provučeno kroz `StopDraft → TripStopInput/StopDraftLike → reconcileStops → create/route api` (uklj. `trips.origin_country_*`).

## 4) Backfill istorije
- Dopuna zemalja postojećim turama ide kroz **redovni „Izmeni rutu"** na turi (sada ima country picker po stanici + za polazak) — office lako dopunjava.
- **Zaseban masovni „Ture bez zemlje" ekran je ODLOŽEN** (opciono po zadatku; ne forsiram masovni upis / ne uvodim mrtav kod). Može kao sledeća sitna kriška ako zatreba.

## 5) CV dopuna — „Zemlje kroz koje je vozio"
- `CareerProfileView`: kartica sa zastavicama (`flagEmoji`, XK bez zvanične → 🏳️) + naziv zemlje (`t(countries.<CODE>)`) + broj tura. Ljubazno prazno stanje.

## 6) Testovi
- **jest**: `countryDetect.test.ts` (eksplicitan kod / ime / grad / nejasno→prazno), `calc.test.ts` (+`flagEmoji`), `stopsMath.test.ts` (redovi dopunjeni `country_code/source`). → **136/136**.
- **test:db**: `career_test.sql` proširen — zemlje: self=4 (DE,AT,IT,SI); office B=2 (IT,SI, **ne** DE iz firme A); office A=2 (DE,AT); izolacija. → **ALL PASSED**.
- **i18n**: `trip.stops.country`, `trip.stops.countryHint`, `career.countriesVisited`, `career.noCountries` u **svih 30** (sr/en autorski).

## PODSETNIK — ručna primena migracije
- **0028 je samo na DEV** (`db push --linked`). **PROD/STAGING** tek uz izričito odobrenje (ritual). Rollback: `drop function career_countries`; kolone (`trip_stops.country_*`, `trips.origin_country_*`) su aditivne/nullable (mogu ostati bez štete, ili `drop column`).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 136/136 (20 suita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ build prolazi |
| Postojeći tokovi (create/edit ture) | ✅ nedirani (country je aditivan, prazno dozvoljeno) |
| i18n 30/30 | ✅ |
| Data-collision guard (§6) | ✅ zemlja rute = odvojeno polje (ne meša se sa interesom/prebivalištem) |
| Link ostao na DEV | ✅ |
