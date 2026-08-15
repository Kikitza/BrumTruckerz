-- ─────────────────────────────────────────────────────────────────────────────
-- 0013 — Paketi i limit vozila po firmi.
--
-- companies dobija plan + vehicle_limit (postojeće firme dobijaju default).
-- ENFORCEMENT je u BAZI (ne samo UI): before-insert trigger na vehicles blokira
-- unos preko limita. Limit je po VOZILIMA (poslovni model). RLS NE menjamo:
-- companies već ima SAMO `company_read` (select) — owner ne može da menja plan/
-- vehicle_limit (default-deny za UPDATE); menja ih platforma (SQL/Dashboard/admin).
-- ─────────────────────────────────────────────────────────────────────────────

alter table companies add column if not exists plan          text not null default 'starter';
alter table companies add column if not exists vehicle_limit int  not null default 5;

-- Trigger funkcija: security definer da broj vozila bude tačan bez obzira na RLS pozivaoca;
-- broji STROGO po NEW.company_id (nema curenja između firmi).
create or replace function public.enforce_vehicle_limit()
  returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_count int;
begin
  select vehicle_limit into v_limit from companies where id = NEW.company_id;
  if v_limit is null then
    return NEW; -- firma bez definisanog limita (ne bi trebalo) — ne blokiraj
  end if;

  select count(*) into v_count from vehicles where company_id = NEW.company_id;
  if v_count >= v_limit then
    raise exception 'VEHICLE_LIMIT_REACHED: % vozila (limit paketa)', v_limit
      using errcode = 'check_violation';
  end if;

  return NEW;
end $$;

drop trigger if exists vehicles_limit_before_insert on vehicles;
create trigger vehicles_limit_before_insert
  before insert on vehicles
  for each row execute function public.enforce_vehicle_limit();
