-- ─────────────────────────────────────────────────────────────────────────────
-- DEV-SEED — početni podaci za DEV projekat (BrumTruckerz-dev).
-- Pokreće se RUČNO (Dashboard -> SQL Editor, ili psql). NIJE migracija: NE stoji u
-- supabase/migrations/, `supabase db push` ga NE pokreće, i NIKAD ne ide na PROD.
--
-- Redosled (kao i ranije za testvozac):
--   1) U DEV Dashboard -> Authentication -> Add user napravi OWNER nalog (email + lozinka).
--   2) Kopiraj njegov auth user id (UUID) i zameni '52c7353e-5637-491a-881e-38e37e722a09' dole.
--   3) Pokreni ovaj fajl u SQL Editor-u.
-- Idempotentno je (on conflict) — može da se pokrene više puta.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Firma (tenant). Fiksni UUID da bude stabilna referenca pri ponovnom pokretanju.
insert into companies (id, name, base_currency)
values ('11111111-1111-1111-1111-111111111111', 'BrumTruckerz', 'EUR')
on conflict (id) do nothing;

-- 2) Owner nalog: veži auth korisnika za firmu kao 'owner'.
--    ZAMENI '52c7353e-5637-491a-881e-38e37e722a09' stvarnim auth user id-em iz koraka 1 (pravi UUID).
insert into app_users (id, company_id, role, full_name)
values ('52c7353e-5637-491a-881e-38e37e722a09', '11111111-1111-1111-1111-111111111111', 'owner', 'Owner')
on conflict (id) do update
  set company_id = excluded.company_id,
      role       = excluded.role;

-- (Vozača dodaješ kasnije istim obrascem: napravi auth user u Dashboard-u, pa
--  app_users(role='driver', company_id=<firma>) + drivers(user_id=<auth id>). V. ranije za testvozac.)
