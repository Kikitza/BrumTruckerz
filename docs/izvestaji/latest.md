# IZVEŠTAJ — F2 KRIŠKA 2: VIES PROVERA PIB-a (da li je EU PIB stvaran i na koga glasi)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Migracija 0022 primenjena; Edge `vies-check` deploy-ovana na DEV. PROD/STAGING **netaknuti**.
> **VIES nema ključeve — nikakve tajne u kodu ni u izveštaju.**

## Izmene (spisak)
- **`supabase/migrations/0022_customers_vies.sql`** (novo, aditivno) — `customers` + `vies_valid` (bool null),
  `vies_checked_at` (timestamptz null), `vies_name` (text null).
- **`supabase/functions/vies-check/index.ts`** (novo) — `requireOffice`; ulaz `{country_code, vat_number,
  customer_id?}` → zove ZVANIČNI VIES REST (`ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number`) →
  `{status: valid|invalid|unavailable, name, address}`. Ako je `customer_id` iz firme pozivaoca (`loadOwnCustomer`)
  → upiše ishod na naručioca (osim `unavailable`). **Timeout 12s + fetch-catch → `unavailable` (ne ruši).**
- **`supabase/functions/_shared/auth.ts`** — dodat `loadOwnCustomer` (provera firme, kao `loadOwnDriver`).
- **`src/features/customers/vies.ts`** (+`.test.ts`, novo) — čiste fn: `VIES_COUNTRIES` (28: 27 članica + `XI`;
  Grčka je `EL`, ne `GR`), `viesCountryCode` (GR→EL), `isEuVatCountry`, `normalizeVat` (velika slova, [A-Z0-9],
  skida vodeći kod zemlje), `viesMessageKey` (ishod → i18n).
- **`src/features/customers/api.ts`** — `Customer` + VIES polja; `checkVat()` (invoke `vies-check`, izvlači Edge grešku).
- **`CustomerFormModal.tsx`** — dugme „Proveri PIB" (aktivno kad EU zemlja + PIB): ✓ „Validan — <ime>" (+ „Preuzmi
  naziv" ako se razlikuje od unetog), ✗ „Nije pronađen u VIES" (**UPOZORENJE, ne blokira čuvanje**), ⚠ „Servis
  nedostupan", i EU-only poruka za ne-EU zemlju.
- **`app/(owner)/customers.tsx`** — na kartici bedž „PIB proveren ✓ <datum>" (i suptilno „PIB nije pronađen" kad je proveren a nevažeći).
- **`src/locales/*.json`** (svih 30) — `customers.checkVat`, `customers.useName`, `customers.vies.*`.

## Smoke na DEV-u (ishodi)
Direktno na ZVANIČNI VIES REST (isti poziv koji Edge radi) + provera da je Edge zaštićena:
| Slučaj | Ulaz | Ishod |
|---|---|---|
| **Validan EU PIB** | `IE 6388047V` (javno poznat) | `valid:true`, ime **„GOOGLE IRELAND LIMITED"** → status **valid** |
| **Nevalidan EU PIB** | `DE 000000000` | `valid:false` → status **invalid** („Nije pronađen u VIES") |
| **Ne-EU (RS)** | `RS 123456789` | VIES `errorWrappers: INVALID_INPUT`; klijent to i NE zove — `isEuVatCountry('RS')=false` → poruka **„VIES proverava samo EU PIB-ove"** |
| **Edge auth** | anon poziv `vies-check` | **HTTP 401 „Neautorizovano"** (requireOffice) |

VIES oblici (valid/invalid/non-EU) provereni uživo i poklapaju se sa parserom Edge funkcije (`valid` bool +
`name`/`address` ili `"---"`; servisne greške kroz `errorWrappers[].error`, „nedostupno" kodovi → `unavailable`).

## Odluke / odstupanja (CLAUDE.md pravilo 5)
1. **✗ ne blokira čuvanje** — VIES „nije pronađen" je UPOZORENJE (vlasnikova odluka); naručilac se svejedno čuva.
2. **`unavailable` se NE upisuje** na naručioca (ne kvari poslednji dobar ishod); mrežna/timeout greška → `unavailable`.
3. **Grčka = `EL`** u VIES-u (ne `GR`) i **`XI`** za Sev. Irsku — pokriveno listom i `GR→EL` aliasom.
4. **Duplirana EU/normalizacija na dve strane** (klijent `vies.ts` u TS, Edge inline u Deno) — namerno: Edge je
   drugi runtime (Deno, bez pristupa `src/`), pa ne može da uveze klijentski modul; logika je minimalna i ista.
5. Provera radi i za **nesačuvanog** naručioca (bez `customer_id`) — samo prikaz + „Preuzmi naziv"; za sačuvanog se ishod i upisuje (badge).

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 14 suita / 99 testova (uklj. `vies` — 8 novih: normalizacija/EU lista/mapiranje) |
| `npm run lint` | ✅ 0 grešaka (5 postojećih upozorenja u tuđim fajlovima) |
| `npm run test:db` | ✅ ALL PASSED (customers svita i dalje prolazi sa novim kolonama) |
| Smoke (VIES REST + Edge 401) | ✅ (tabela gore) |

## Migracije / deploy — ručna primena
- **DEV:** `0022` primenjena; Edge `vies-check` deploy-ovana.
- **STAGING / PROD:** **nije dirano.** Primena uz odobrenje: `db push` (0022 aditivno — 3 nullable kolone) +
  `functions deploy vies-check`. Bez tajni/Auth promena.
- **HITNI SQL / rollback (DEV):** `alter table customers drop column vies_valid, drop column vies_checked_at, drop column vies_name;`

## Jezici
i18n **dopunjen u SVIH 30 jezika** — `customers.checkVat`, `customers.useName`, `customers.vies.*`. `sr`/`en`
autorski; 28 mašinski (status `"machine"` nepromenjen); `en` potpun (fallback). Skripta potvrdila poklapanje.

## Reverzibilnost
Provera je nedestruktivna; ishod se može ponovo pokrenuti. „Preuzmi naziv" je opciono (ne prepisuje bez klika).
Izmena naziva/PIB-a resetuje prikazani ishod dok se ne proveri ponovo.

## Kvalitet koda
Slojevi razdvojeni (VIES poziv u Edge; klijent kroz `customers/api.ts`; čiste fn u `vies.ts`); reusable
`loadOwnCustomer`; prati postojeće obrasce (edge `requireOffice`/`fnError`, React Query invalidacije, tokeni/`t()`).
**Pravila kvaliteta ispoštovana** (jedini svesni dup: EU/normalizacija u dva runtime-a, obrazloženo).

## ČEKA SE (potez vlasnika)
1. Kad se bude primenjivalo na PROD: `db push 0022` + `functions deploy vies-check` uz odobrenje (aditivno, bez tajni).
