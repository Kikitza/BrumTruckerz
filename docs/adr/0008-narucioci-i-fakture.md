# ADR 0008 — Naručioci i fakture

## KONTEKST (danas u kodu/šemi)
- **Ne postoji** entitet naručioca/klijenta. Prihod ture je jedno polje `trips.revenue` (unosi vlasnik, `0001:99`) bez veze ka kome je faktura.
- Nema fakture ni evidencije naplaćeno/kasni. PIB firme postoji na `companies.pib` (`0001:29`), ali ne za kupce.
- Novac već ima kanon `original+rate+base` (ADR 0005); prilozi imaju generički model (ADR 0007) pogodan za PDF fakture; tura dobija javni broj `BT-T` (ADR 0006).
- MASTER-PLAN F2: „razlog naplate" — naručioci, fakture, VIES, statusi plaćanja.

## ODLUKA
- Uvesti **`customers` (naručilac)** kao tenant entitet (kartoteka: naziv, PIB/VAT, kontakt, rok plaćanja); tura dobija `customer_id`. **VIES provera** VAT-a na unosu (Edge, keširano). 
- **`invoices`**: tura → PDF faktura (multivaluta po ADR 0005, **numeracija po firmi**, logo firme, stavke), sa **statusom plaćanja** (izdato/plaćeno/kasni) po fakturi.
- **Odbačeno:** (a) držati kupca kao slobodan tekst na turi — ista greška kao geografija (ADR 0004), nema kartoteke ni statusa naplate; (b) generisati PDF na Deno preko Puppeteer-a — ne radi na Deno; koristi `pdf-lib`/`exceljs` (CLAUDE.md redosled §9); (c) globalna numeracija faktura — pravno se traži niz po izdavaocu (firmi).

## SKICA ŠEME (nacrt)
```
customers
  id, company_id, name, vat_number, vat_valid bool, vat_checked_at,
  contact, payment_terms_days int, created_at        -- indeks (company_id)
trips.customer_id  uuid → customers(id)               -- nullable (most za stare ture)
invoices
  id, company_id, customer_id, trip_id,
  number text,               -- niz PO FIRMI (unique (company_id, number))
  issued_on date, due_on date,
  currency, total_base, status text,   -- 'issued'|'paid'|'overdue'
  storage_key                -- PDF preko attachments/Storage (ADR 0007, owner_type='invoice')
invoice_items (id, invoice_id, description, qty, unit_price, amount)
```

## MIGRACIONI PUT (bez prekida)
1. Aditivno: `customers`, `invoices`, `invoice_items`, `trips.customer_id` (nullable).
2. Stare ture ostaju bez naručioca (`customer_id=null`) — ništa se ne ruši; `trips.revenue` ostaje izvor prihoda dok faktura ne preuzme.
3. Numeracija: sekvenca po `company_id`; staging proba pre PROD-a.
4. PROD uz odobrenje.

## TESTOVI ČUVARI
- test:db: `customers`/`invoices` RLS izolacija (firma A ≠ B); `unique(company_id, number)`; vozač **ne vidi** naručioce/fakture (finansije, pravilo #2).
- jest: obračun stavki → total (kod, ne model, ADR 0005); status naplate (due_on + plaćeno → overdue); VIES parsiranje odgovora.

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
