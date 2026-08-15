-- ─────────────────────────────────────────────────────────────────────────────
-- NEW-COMPANY.sql — RECEPT: nova firma + owner nalog (onboarding).
-- Template ide u git (BEZ tajni). Pokreće PLATFORMA u SQL Editoru CILJNE baze.
--
-- PREDUSLOV: owner auth user je već napravljen u Dashboard-u (Authentication → Add user,
-- email vlasnika + Auto Confirm). Uzmi njegov UUID i popuni <OWNER_AUTH_ID>.
--
-- Popuni placeholdere pa Run:
--   <IME_FIRME>       npr. Prevoz Marković d.o.o.
--   <BAZNA_VALUTA>    EUR | RSD | …           (P&L bazna valuta firme)
--   <PLAN>            starter | pro | …        (naziv paketa)
--   <LIMIT>           broj vozila u paketu     (npr. 5)
--   <OWNER_AUTH_ID>   UUID auth korisnika vlasnika (iz Dashboard-a)
--
-- Idempotentno: ako owner već ima app_users red, NE pravi drugu firmu (samo javi).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare v_company uuid;
begin
  if exists (select 1 from public.app_users where id = '<OWNER_AUTH_ID>') then
    raise notice 'app_users već postoji za %, preskačem (nema duple firme).', '<OWNER_AUTH_ID>';
    return;
  end if;

  insert into public.companies (name, base_currency, plan, vehicle_limit)
    values ('<IME_FIRME>', '<BAZNA_VALUTA>', '<PLAN>', <LIMIT>)
    returning id into v_company;

  insert into public.app_users (id, company_id, role)
    values ('<OWNER_AUTH_ID>', v_company, 'owner');

  raise notice 'OK: firma % (%) — owner %', v_company, '<IME_FIRME>', '<OWNER_AUTH_ID>';
end $$;

-- Kontrola (mora vratiti tačno 1 red: firma + owner):
select c.id as company_id, c.name, c.base_currency, c.plan, c.vehicle_limit,
       u.id as owner_uid, u.role
from public.app_users u
join public.companies c on c.id = u.company_id
where u.id = '<OWNER_AUTH_ID>';
