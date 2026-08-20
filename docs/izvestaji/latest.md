# IZVEŠTAJ — F2 KRIŠKA 1: NARUČIOCI (kartoteka klijenata + tura dobija naručioca)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Migracija 0021 primenjena na DEV. PROD/STAGING **netaknuti**. VIES provera NIJE u ovoj krišci (sledeća).

## Izmene (spisak)
- **`supabase/migrations/0021_customers.sql`** (novo):
  - **`customers`** (company_id, `name` NOT NULL, `vat_number`, `country_code` (2 slova, tekst), `contact_email`,
    `contact_phone`, `address`, `payment_terms_days` default 30, `note`, `archived_at`, `created_at`); indeks
    `(company_id, archived_at, name)`.
  - **RLS:** `customers_office` (owner+dispatcher pun pristup u SVOJOJ firmi kroz `is_office_role()`); **vozač i
    platform_admin NEMAJU politiku → NIŠTA** (fail-closed); RESTRICTIVE suspend-gate (insert/update/delete, obrazac 0015).
  - **`trips.customer_id`** uuid null FK → customers **ON DELETE RESTRICT** (naručilac sa turama se ne briše —
    arhivira se; postojeće ture ostaju bez naručioca — legalno i zauvek dozvoljeno); indeks `(company_id, customer_id)`.
  - `driver_trips` view (0001) je kolonski eksplicitan → **NE dobija** `customer_id`. Vozač naručioca ne vidi nigde.
- **`src/features/customers/api.ts`** (novo) — `listCustomers` (sa `trip_count` preko embedded `trips(count)`),
  `listActiveCustomers`, `createCustomer`, `updateCustomer`, `archiveCustomer`, `unarchiveCustomer`, `deleteCustomer`.
- **`src/features/customers/CustomerFormModal.tsx`** (novo) — Nov/Izmeni (REVERZIBILNOST #2: forma sa vrednostima).
- **`src/features/customers/CustomerPickerField.tsx`** (novo) — picker aktivnih + „Bez naručioca" + prečica
  „Nov naručilac" (otvara formu, po kreiranju odmah bira). Koristi se SAMO na owner/office ekranima ture.
- **`app/(owner)/customers.tsx`** (novo) + **`app/(owner)/_layout.tsx`** (tab „Naručioci") — lista (naziv, PIB, rok
  plaćanja, broj tura), filter aktivni/arhivirani; brisanje: SA turama → samo „Arhiviraj" (+ „Aktiviraj" nazad, uz
  potvrdu); BEZ tura → „Obriši" (uz potvrdu).
- **`src/features/trips/api.ts`** — `Trip.customer_id`, `CreateTripInput.customer_id`, `ownerCreateTrip` upisuje ga,
  `ownerGetTrip` embeduje `customer:customers(name)`, novi `ownerUpdateTripCustomer(tripId, customerId)`.
- **`NewTripModal.tsx`** (korak 4: „Naručilac" picker) i **`TripDetailModal.tsx`** (Finansije: picker naručioca,
  čuva se odmah po izboru) — naziv naručioca u detaljima ture.
- **`src/locales/*.json`** (svih 30) — `tabs.customers`, `trip.fields.customer`/`customerNone`, ceo `customers` namespace.

## Odluke / odstupanja (CLAUDE.md pravilo 5)
1. **Vozač naručioca NE vidi** — potvrđeno na DVA nivoa: (a) `customers` RLS nema vozačku politiku (select 0);
   (b) `driver_trips` view nema `customer_id` kolonu (test to i tvrdi). Finansijska sfera ostaje van vozača.
2. **platform_admin NIŠTA** nad `customers` (poslovni sadržaj, u duhu 0014) — nema politike.
3. **Naručilac na turi = office** (owner+dispatcher), menja se kroz `trips` update (RLS office iz 0020); ne dira
   dodelu/vozarinu. Editovanje dozvoljeno i na završenoj turi (poslovni podatak, kao finansije).
4. **Arhiviraj vs Obriši** vođeno `trip_count`-om (embedded count): sa turama → arhiva (RESTRICT ionako brani
   brisanje u bazi — dupla brana), bez tura → brisanje.

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 13 suita / 91 test (čiste fn nepromenjene — customers je DB-testiran) |
| `npm run lint` | ✅ 0 grešaka (5 postojećih upozorenja u tuđim fajlovima) |
| `npm run test:db` | ✅ ALL PASSED (… + **customers**) |

**customers_test.sql:** office (owner+dispatcher) pun pristup u svojoj firmi; izolacija firmi (owner B 0);
**vozač 0**; **platform_admin 0**; suspend-gate (dispečer obustavljene firme ne upisuje); **RESTRICT** brisanja
naručioca SA turom (arhiviranje umesto), brisanje BEZ tura dozvoljeno; **driver_trips nema `customer_id`**.

## Migracije — ručna primena
- **DEV:** `0021` primenjena (`supabase db push --linked`).
- **STAGING / PROD:** **nije dirano.** Primena uz odobrenje: `db push` (0021 je aditivna — nova tabela + nova
  nullable kolona sa FK; bez dodira postojećih podataka). Nema Edge/Auth promena u ovoj krišci.
- **HITNI SQL / rollback (DEV):** `alter table trips drop column customer_id; drop table customers;`

## Jezici
i18n **dopunjen u SVIH 30 jezika** — `tabs.customers`, `trip.fields.customer`/`customerNone`, `customers` namespace
(polja + akcije + `tripCount_one/_other`). `sr`/`en` autorski; 28 mašinski (status `"machine"` nepromenjen);
`en` potpun (fallback). Skripta potvrdila poklapanje ključeva.

## Reverzibilnost
Nov/Izmeni kroz modal; arhiviranje i brisanje **uz potvrdu**; „Aktiviraj" vraća arhiviranog. Picker na turi ima
„Bez naručioca" (uklanjanje). Nema gubitka unosa.

## Kvalitet koda
Slojevi razdvojeni (jedini Supabase sloj `customers/api.ts`; UI zove api); reusable `CustomerPickerField`
(deljen između Nove ture i Izmeni); prati postojeće obrasce (fleet CRUD, PickerField/ModalScaffold, React Query
invalidacije, is_office_role gate, test:db impersonacija). Bez duplirane logike; **pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. (i dalje otvoreno) reset PROD DB lozinke; odluka o stagingu (higijena posle proba).
2. Kad se bude primenjivalo na PROD: `db push 0021` uz odobrenje (aditivno; bez Edge/Auth).
