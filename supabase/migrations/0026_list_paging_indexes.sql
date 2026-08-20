-- ─────────────────────────────────────────────────────────────────────────────
-- 0026 — Indeksi za server paginaciju listi (F3 test izdržljivosti). Aditivno.
--
-- Nalaz (staging, ~1200 tura / 300 faktura): upiti su sub-ms zahvaljujući postojećim
-- indeksima, ALI:
--   * fakture se sortiraju po issue_date desc — postojeći (company_id, status, issue_date)
--     ne služi ORDER (vodeći `status`) → Seq Scan + Sort. Dodajemo namenski indeks za
--     paginirani redosled liste faktura (avoid sort, jeftin „Učitaj još").
--   * arhiva tura = status='finished' order by created_at desc → dedikovan (company_id,
--     status, created_at desc) daje index-order za paging arhive.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists invoices_company_issue_idx on invoices (company_id, issue_date desc, invoice_no desc);
create index if not exists trips_company_status_created_idx on trips (company_id, status, created_at desc);
