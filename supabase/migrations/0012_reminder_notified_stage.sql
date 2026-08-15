-- ─────────────────────────────────────────────────────────────────────────────
-- 0012 — Push opomene za rokove: praćenje poslednjeg poslatog praga.
--
-- push_tokens VEĆ postoji (migracija 0002) sa traženom šemom:
--   push_tokens(user_id -> app_users(id) [= auth.users], token, platform, updated_at,
--   pk(user_id, token)) + RLS push_own (korisnik upravlja SAMO svojim tokenima).
-- Zato se ovde NE kreira ponovo — dodaje se samo notified_stage na reminders.
--
-- notified_stage = poslednji (najhitniji = najmanji) prag {30,7,1,0} za koji je
-- poslato obaveštenje. Cron šalje samo kad je novi prag hitniji od zapisanog
-- (ili je null), pa upiše novi prag → prag se ne ponavlja. Reset na null pri
-- promeni due_date (rok produžen → opomene kreću iznova) radi klijent/api.
-- ─────────────────────────────────────────────────────────────────────────────

alter table reminders add column if not exists notified_stage int;
