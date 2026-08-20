# IZVEŠTAJ — F2 KRUNA: FAKTURA v1 (tura → PDF faktura, brojevi po firmi, statusi plaćanja)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Migracija 0023 primenjena na DEV. Bez novih Edge/Auth promena. PROD/STAGING **netaknuti**.

## Izmene (spisak)
- **`supabase/migrations/0023_invoices.sql`** (novo):
  - **`invoice_settings`** (podaci IZDAVAOCA po firmi: legal_name/address/tax_id/reg_no/bank_account,
    default_vat_rate, default_vat_note, prefix); RLS office; suspend-gate.
  - **`invoice_counters`** + **`next_invoice_no(company)`** — brojevi po (firma, godina), **SELECT … FOR UPDATE**
    na brojaču (C2 TOCTOU: bez preskakanja/duplikata pod konkurencijom), format `<prefix><GODINA>-<NNN>`.
  - **`invoices`** (customer_id NOT NULL, trip_id null **FK RESTRICT**, invoice_no **unique po firmi**, issue/due,
    currency, amount/vat_rate/vat_amount/total **računato u KODU round2 — pravilo #5**, vat_note, status
    **issued|paid|cancelled** (bez draft; **bez DELETE** — storno = cancelled + cancel_reason), paid_at,
    pdf_storage_key, note, created_by). „Kasni" NIJE kolona — **computed** (issued && due_date < danas).
  - **`issue_invoice(...)`** SECURITY DEFINER RPC — zaključa brojač, izračuna iznose, ubaci fakturu u **jednoj
    transakciji** → broj se „potroši" samo ako faktura nastane (bez rupa). Provera: office, aktivna firma, naručilac/tura iz firme.
  - RLS: office select + update (plaćeno/storno/pdf); **UPIS samo kroz RPC** (nema insert politike → numeracija se ne zaobilazi); vozač/admin NIŠTA; suspend-gate; bez DELETE.
- **`src/features/invoices/calc.ts`** (+`.test.ts`, novo) — čiste fn: `round2`, `computeInvoiceAmounts` (osnova/PDV/ukupno),
  `formatInvoiceNo`, `proposeDueDate`, `invoiceDisplayStatus` (KASNI computed).
- **`src/features/invoices/api.ts`** (novo) — settings, liste, `getIssueContext`, `issueInvoice` (RPC), `markInvoicePaid`,
  `cancelInvoice`, `setInvoicePdfKey`, `listIssuableTrips`.
- **`src/features/invoices/pdf.ts`** (novo) — HTML šablon (sr/en) → **expo-print** `printToFileAsync` → upload u
  `prilozi` pod **`company_id/invoices/<invoice_id>.pdf`** (deterministički ključ → bez siročadi) → **expo-sharing** „Podeli".
- **UI:** `InvoiceSettingsModal`, `IssueInvoiceModal` (iznos=vozarina, valuta firme, PDV/napomena iz izdavaoca,
  rok=izdavanje+rok naručioca; izbor jezika PDF-a), `InvoiceDetailModal` (Podeli/Plaćeno/Storniraj uz potvrde),
  **novi tab `app/(owner)/invoices.tsx`** (lista + bedž statusa, KASNI **crveno**; filteri; „Nova faktura" = izbor ture bez fakture).
  „Izdaj fakturu" u detalju ture (uslov: naručilac + vozarina). „Podaci izdavaoca" u Podešavanjima (Izmeni).
- **`src/locales/*.json`** (svih 30) — `tabs.invoices` + ceo `invoice` namespace (47 ključeva).

## Ključne odluke / odstupanja (CLAUDE.md pravilo 5)
1. **PDF samo SR/EN** (izbor pri izdavanju, default `sr`). Faktura je pravni dokument → idu samo **autorski** prevodi;
   ostali jezici (mašinski) se NE koriste za fakturu — dolaze kad budu overeni. UI aplikacije je i dalje u svih 30.
2. **Numeracija atomična kroz `issue_invoice` RPC** (brojač + upis u istoj transakciji) → nema rupa ni pri padu upisa.
   `next_invoice_no` koristi `SELECT … FOR UPDATE` (C2). **Nema client insert politike** — broj se ne može zaobići.
3. **Plaćeno/Storno/PDF-ključ = office UPDATE kroz RLS** (ne RPC): office je poverljiv unutar firme; izdavanje (numeracija)
   ostaje jedini RPC-om zaštićen upis. Kolonska ograničenja (npr. da se ne menja iznos) nisu RLS posao — v1 odluka.
4. **Iznosi računa KOD**: RPC (SQL `round(...,2)`) je autoritet; TS `computeInvoiceAmounts` je isti obračun za PRIKAZ/predlog.
5. **PDF ključ deterministički** (`…/invoices/<invoice_id>.pdf`, upsert) → ponovno generisanje prepisuje isti objekat (bez siročadi).
6. **Storage putanja pokrivena**: prvi segment ključa = `company_id` → `prilozi_owner_read/write` (0020, office) i
   `prilozi_active_write` (suspend, 0015) je pokrivaju; vozačke storage politike se ne diraju → **vozač PDF ne vidi**.
7. **Vozač fakture NE vidi**: nema tab u (driver), a `invoices`/`invoice_settings` RLS je office-only (test: vozač 0).

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 15 suita / 107 testova (uklj. `calc` — 8: obračun/format/rok/status) |
| `npm run lint` | ✅ 0 grešaka (5 postojećih upozorenja u tuđim fajlovima) |
| `npm run test:db` | ✅ ALL PASSED (… + **invoices**) |

**invoices_test.sql:** office izolacija (owner B 0); **vozač 0**; **admin 0**; **numeracija** `…-001/002/003` (bez rupa),
**obračun** 1000@20% → PDV 200 / ukupno 1200; dispečer vidi + označava plaćeno; **unique** invoice_no po firmi;
**storno NE oslobađa broj** (posle storna 002 → sledeći je 003); **RESTRICT** brisanja ture sa fakturom; **suspend** (issue blokiran).

## Migracije / deploy — ručna primena
- **DEV:** `0023` primenjena. Nema Edge/Auth promena u ovoj krišci.
- **STAGING / PROD:** **nije dirano.** Primena uz odobrenje: `db push` (0021+0022+0023 su pending na PROD-u od F2) i
  `functions deploy vies-check` (iz F2 K2). 0023 je aditivno (nove tabele/RPC; `trips` dobija nullable FK kolonu — bez dodira podataka).
- **HITNI SQL / rollback (DEV):** `drop function issue_invoice(uuid,uuid,text,numeric,numeric,date,text,text); drop function next_invoice_no(uuid); drop table invoices; drop table invoice_counters; drop table invoice_settings;`

## Jezici
i18n aplikacije **dopunjen u SVIH 30 jezika** — `tabs.invoices` + `invoice` namespace (status/filter/fields/settings).
`sr`/`en` autorski; 28 mašinski (status `"machine"` nepromenjen); `en` potpun (fallback). **PDF šablon: samo sr+en** (v. odluka 1).

## Reverzibilnost
Nov/Izmeni izdavaoca kroz modal; izdavanje ima „Nazad/Otkaži"; plaćeno/storno **uz potvrdu** (+ datum/razlog).
Faktura se **ne briše** (storno = status, ADR duh). PDF se može ponovo generisati iz detalja.

## Kvalitet koda
Slojevi razdvojeni (Supabase samo u `invoices/api.ts`; čiste fn u `calc.ts`; PDF izolovan u `pdf.ts`); prati postojeće
obrasce (upload kao attachments handler, `ModalScaffold`/`Field`/`DateField`, React Query invalidacije, definer RPC,
test:db impersonacija). Bez duplirane logike. **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. PROD sync F2 (uz odobrenje): `db push` 0021→0023 + `functions deploy vies-check`, po receptu iz ranijeg izveštaja
   (STOP-kapije: utvrdi stanje → dry-run tačno 0021–0023 → PRE/POSLE brojevi → relink DEV).
