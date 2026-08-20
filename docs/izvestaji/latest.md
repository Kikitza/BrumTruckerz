# IZVEŠTAJ — F2 FINALE: ČAROBNJAK NOVE FIRME + ISO DRŽAVE + TIPOVI VOZILA (samouslužni ulaz)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Migracija 0025 primenjena. **Kraj SQL recepta za novu firmu** — čarobnjak je put. PROD/STAGING **netaknuti**.

## Izmene (spisak)
- **`supabase/migrations/0025_countries_vehicle_types_self_serve.sql`** (novo):
  - **`countries`** (code 2 slova PK, name_key, eu_member, sort) — kurirana lista **41** (EU 27 + EFTA + UK + Balkan +
    susedi TR/UA/MD); RLS: svi authenticated čitaju, **nema write politike** (platforma).
  - **`vehicle_types`** (code, name_key, sort) — seed 9 (kombi, pikap, solo, tegljač+poluprikolica, hladnjača, cisterna,
    autotransporter, kiper, kontejnerski); isti RLS; **`vehicles.type_id`** null FK (postojeća vozila null = prilagođeno).
  - **`companies.country_code`** null FK → countries.
  - **`create_company_self(name, country_code, base_currency)`** SECURITY DEFINER — **samo za NoRole korisnika** (bez
    app_users reda; inače `SELF_ALREADY_HAS_COMPANY`); firma (starter/limit 5) + `app_users` OWNER + prazan `invoice_settings`; vraća company_id.
- **`src/lib/currencies.ts`** (+`.test.ts`, novo) — deljena lista 13 valuta (ExpenseForm sada uvozi odavde) + `suggestCurrency` (RS→RSD, eurozona→EUR, inače EUR).
- **`src/features/company/api.ts`** (novo) — `listCountries`, `listVehicleTypes`, `createCompanySelf`.
- **`src/features/company/CountryPickerField.tsx`** (novo) — picker država **sa pretragom** iz šifarnika.
- **`src/features/company/NewCompanyWizard.tsx`** (novo) — 3 koraka („Nazad" bez gubitka): naziv+zemlja+valuta (predlog po
  zemlji) → prvo vozilo (preskočivo: tip+registracija) → pregled → `create_company_self` → **gate reload** (vlasnik ulazi u svoju novu praznu firmu).
- **`app/index.tsx`** — NoRole dobio dugme „Otvori novu firmu" (uz „Imam kod firme").
- **Pickeri država**: `CustomerFormModal` (country_code), `ReminderFormModal` (vinjeta/needs_country) i čarobnjak koriste
  `CountryPickerField`. **Flota**: vozilo dobija picker tipa (uz zadržan slobodan `make_model`).
- **`RUNBOOK.md`** — sekcija „Nova firma" označena **LEGACY** (čarobnjak je put; admin tabla nepromenjena — vidi i nove firme + suspend).
- **`src/locales/*.json`** (svih 30) — `countries.*` (41), `vehicleTypes.*` (9), `country.*`, `company.*`, `fleet.fields.vehicleTypeNone`.

## Odluke / odstupanja (CLAUDE.md pravilo 5)
1. **Imena država: sr + en autorski; 28 mašinskih fajlova nose ENGLESKO ime (placeholder)** — lokalizacija 41 države ×
   30 jezika je velik i greškopodložan skup; en je fallback, a puna lokalizacija imena država dolazi kasnije. Ovo je
   „izvodljiv pristup" tražen u zadatku (obrazloženje). `name_key` = `countries.<CODE>`.
2. **Slobodni unosi kompatibilni:** `customers.country_code`/`reminders.country_code` su i dalje `text` — picker upisuje
   **2-slovni ISO kod** (isti oblik kao ranije ručni unos), pa su postojeći podaci kompatibilni. `vehicles.make_model`
   ostaje slobodan uz novi `type_id`. **VIES lista NIJE dirana** (GR→EL mapiranje u `vies.ts` i dalje važi; ISO šifarnik je zaseban).
3. **`create_company_self` samo za NoRole** (bez app_users) — samouslužno, bez potrebe za platformom; admin tabla i dalje vidi/suspenduje sve firme.
4. **`suggestCurrency` predlaže samo valute iz liste 13** (očigledni slučajevi: RS→RSD, eurozona→EUR); ostalo EUR.

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 17 suita / 120 testova (uklj. `currencies` — 4: predlog valute) |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja u tuđim fajlovima) |
| `npm run test:db` | ✅ ALL PASSED (… + **company_self**) |

**company_self_test.sql:** NoRole korisnik uspeva (firma starter/limit 5/active + owner + invoice_settings); korisnik SA
firmom **odbijen**; **izolacija** (postojeći vlasnik ne vidi novu firmu i obrnuto); countries(41)/vehicle_types(9)
čitljivi svima; **klijentski write u countries odbijen**.

## Migracije / deploy — ručna primena
- **DEV:** `0025` primenjena. Bez Edge/Auth promena u ovoj krišci.
- **STAGING / PROD:** **nije dirano.** Primena uz odobrenje: `db push` (0025 aditivno — 2 šifarnika + 2 nullable FK kolone
  + RPC; postojeći podaci netaknuti).
- **HITNI SQL / rollback (DEV):** `drop function create_company_self(text,text,text); alter table companies drop column country_code; alter table vehicles drop column type_id; drop table vehicle_types; drop table countries;`

## Jezici
i18n **dopunjen u SVIH 30 jezika** — `countries.*` (41; sr/en autorski, ostali EN placeholder — v. odluka 1),
`vehicleTypes.*` (9, prevedeni), `country.*`, `company.*`, `fleet.fields.vehicleTypeNone`. `en` potpun (fallback). Skripta potvrdila poklapanje.

## Reverzibilnost
Čarobnjak: „Nazad" kroz korake bez gubitka; korak 2 preskočiv; pregled pre kreiranja. Pickeri imaju „Bez države"/„Bez tipa".

## Kvalitet koda
Slojevi razdvojeni (Supabase u `company/api.ts`; čiste fn u `currencies.ts`); **DRY** (13 valuta izdvojene, ExpenseForm ih
uvozi); reusable `CountryPickerField` (naručilac/vinjeta/čarobnjak); prati postojeće obrasce (wizard kao NewTripModal,
PickerField/ModalScaffold, RPC, definer, test:db impersonacija). **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. PROD sync F2 (uz odobrenje): `db push` 0021→0025 + `functions deploy` (vies-check, reminders-cron), po receptu sa STOP-kapijama.
