-- ─────────────────────────────────────────────────────────────────────────────
-- 0022 — VIES provera PIB-a: rezultat na naručiocu. F2 kriška 2. Aditivno.
--
-- customers dobija ishod poslednje VIES provere:
--   vies_valid      bool null  — true (validan), false (nije pronađen), null (nikad provereno)
--   vies_checked_at timestamptz null — kada je provereno
--   vies_name       text null  — naziv iz VIES registra (kad je validan)
--
-- Upis radi Edge funkcija `vies-check` (service role + provera firme). RLS se ne menja
-- (customers_office iz 0021 i dalje važi za klijentska čitanja).
-- ─────────────────────────────────────────────────────────────────────────────

alter table customers add column vies_valid      boolean;
alter table customers add column vies_checked_at timestamptz;
alter table customers add column vies_name       text;
