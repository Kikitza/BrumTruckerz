-- 0005_companies_rls.sql
--
-- KONTEKST: tenant-izolacija + RLS su VEĆ uspostavljeni u 0001/0002:
--   * companies (tabela) + app_users (profil: auth.users -> company_id + role);
--   * company_id NOT NULL na svim tenant tabelama (vehicles/trailers/drivers/
--     trips/trip_events/expenses/attachments/reminders/…);
--   * RLS uključen na svih 13 tabela;
--   * helper funkcije current_company_id() / current_role_name() / current_driver_id();
--   * owner/driver policy-ji koji POŠTUJU pravilo #2 (vozač NEMA select na baznu
--     trips; čita driver_trips view bez finansija).
--
-- Zato ova migracija NE pravi companies/profiles, NE dodaje company_id kolone,
-- NE radi backfill (postojeći redovi već nose company_id) i NE dira postojeće
-- policy-je. Dodaje samo dve bezopasne, aditivne stvari:
--   1) is_owner() — imenovani helper (za buduće policy-je/čitljivost);
--   2) DEFAULT current_company_id() na company_id kolonama — pojas i tregeri:
--      ako neki budući insert izostavi company_id, baza upiše firmu ulogovanog
--      korisnika; WITH CHECK politike (company_id = current_company_id()) i dalje važe.

-- 1) is_owner(): true ako je ulogovani korisnik owner svoje firme.
create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.current_role_name() = 'owner'
$$;

-- 2) DEFAULT company_id = firma ulogovanog korisnika.
--    (Funkcija je schema-kvalifikovana da default ne zavisi od search_path pozivaoca.)
alter table vehicles  alter column company_id set default public.current_company_id();
alter table trailers  alter column company_id set default public.current_company_id();
alter table trips     alter column company_id set default public.current_company_id();
alter table reminders alter column company_id set default public.current_company_id();

-- NAPOMENA (registracija/pozivnice): trenutno se app_users red kreira service-role/
-- ručno; nema klijentskog toka registracije. TODO (kasnija faza): vlasnik kreira
-- app_users red (role='driver', bez firme dok ga ne veže) i povezuje drivers.user_id.
-- Sistem pozivnica se NE gradi sada.
