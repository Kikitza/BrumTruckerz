-- 0006_expenses_created_by.sql
-- Atribucija unosioca troška (ko je uneo). Minimalno, bez izmena RLS-a.
--   * created_by uuid null references auth.users, default auth.uid();
--   * stari redovi ostaju null (nije backfill-ovano);
--   * upis ide preko DEFAULT-a (auth.uid()) — klijent NE šalje created_by.
-- RLS ostaje kakav je (owner pun CRUD u firmi; vozač CRUD samo za svoje ture).

alter table expenses
  add column if not exists created_by uuid references auth.users(id) default auth.uid();
