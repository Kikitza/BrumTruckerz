-- ─────────────────────────────────────────────────────────────────────────────
-- 0025 — ISO DRŽAVE + TIPOVI VOZILA + SAMOUSLUŽNO OTVARANJE FIRME. F2 finale.
--
--   (A) countries — šifarnik (code 2 slova PK, name_key, eu_member, sort); RLS: svi
--       authenticated čitaju, write samo platforma (obrazac reminder_types/0024).
--   (B) vehicle_types — šifarnik (code, name_key, sort); isti RLS; vehicles.type_id null FK
--       (postojeća vozila null = prilagođeno; Flota picker zadržava slobodan naziv).
--   (C) companies.country_code null FK → countries (postojeće firme null).
--   (D) create_company_self(...) SECURITY DEFINER — samouslužni ulaz (kraj SQL recepta):
--       SAMO za auth korisnika BEZ app_users reda; firma (starter/limit 5) + owner + prazan
--       invoice_settings; vraća company_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- (A) DRŽAVE — kurirana lista EU + EFTA + UK + Balkan + susedi (transport).
create table countries (
  code      text primary key check (char_length(code) = 2),
  name_key  text not null,          -- i18n ključ 'countries.<CODE>'
  eu_member boolean not null default false,
  sort      int not null default 10
);
alter table countries enable row level security;
create policy countries_read on countries for select using (auth.uid() is not null);

insert into countries (code, name_key, eu_member, sort) values
  ('RS','countries.RS', false, 1),   -- primarno tržište
  ('AT','countries.AT', true, 10),('BE','countries.BE', true, 10),('BG','countries.BG', true, 10),
  ('HR','countries.HR', true, 10),('CY','countries.CY', true, 10),('CZ','countries.CZ', true, 10),
  ('DK','countries.DK', true, 10),('EE','countries.EE', true, 10),('FI','countries.FI', true, 10),
  ('FR','countries.FR', true, 10),('DE','countries.DE', true, 10),('GR','countries.GR', true, 10),
  ('HU','countries.HU', true, 10),('IE','countries.IE', true, 10),('IT','countries.IT', true, 10),
  ('LV','countries.LV', true, 10),('LT','countries.LT', true, 10),('LU','countries.LU', true, 10),
  ('MT','countries.MT', true, 10),('NL','countries.NL', true, 10),('PL','countries.PL', true, 10),
  ('PT','countries.PT', true, 10),('RO','countries.RO', true, 10),('SK','countries.SK', true, 10),
  ('SI','countries.SI', true, 10),('ES','countries.ES', true, 10),('SE','countries.SE', true, 10),
  ('CH','countries.CH', false, 10),('IS','countries.IS', false, 10),('LI','countries.LI', false, 10),
  ('NO','countries.NO', false, 10),('GB','countries.GB', false, 10),
  ('BA','countries.BA', false, 2),('ME','countries.ME', false, 2),('MK','countries.MK', false, 2),
  ('AL','countries.AL', false, 2),('XK','countries.XK', false, 2),
  ('TR','countries.TR', false, 10),('UA','countries.UA', false, 10),('MD','countries.MD', false, 10);

-- (B) TIPOVI VOZILA
create table vehicle_types (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,
  name_key text not null,
  sort     int not null default 0
);
alter table vehicle_types enable row level security;
create policy vehicle_types_read on vehicle_types for select using (auth.uid() is not null);

insert into vehicle_types (code, name_key, sort) values
  ('van',          'vehicleTypes.van',          10),
  ('pickup',       'vehicleTypes.pickup',       20),
  ('rigid',        'vehicleTypes.rigid',        30),
  ('tractor_semi', 'vehicleTypes.tractor_semi', 40),
  ('reefer',       'vehicleTypes.reefer',       50),
  ('tanker',       'vehicleTypes.tanker',       60),
  ('car_carrier',  'vehicleTypes.car_carrier',  70),
  ('tipper',       'vehicleTypes.tipper',       80),
  ('container',    'vehicleTypes.container',    90);

alter table vehicles add column type_id uuid references vehicle_types(id) on delete set null;

-- (C) companies.country_code
alter table companies add column country_code text references countries(code);

-- (D) SAMOUSLUŽNO OTVARANJE FIRME
create or replace function public.create_company_self(
  p_name text, p_country_code text, p_base_currency text
) returns uuid
  language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if v_uid is null then raise exception 'SELF_NOT_AUTHENTICATED' using errcode = '42501'; end if;
  -- SAMO za NoRole korisnika (bez app_users reda) — inače već ima firmu.
  if exists (select 1 from app_users where id = v_uid) then
    raise exception 'SELF_ALREADY_HAS_COMPANY';
  end if;
  if v_name is null then raise exception 'SELF_NAME_REQUIRED'; end if;

  insert into companies (name, base_currency, country_code)
    values (v_name, coalesce(nullif(trim(p_base_currency), ''), 'EUR'),
            nullif(upper(trim(p_country_code)), ''))
    returning id into v_company;

  insert into app_users (id, company_id, role, full_name)
    values (v_uid, v_company, 'owner',
            (select nullif(trim(raw_user_meta_data->>'full_name'), '') from auth.users where id = v_uid));

  insert into invoice_settings (company_id) values (v_company);  -- prazan; popunjava se pre prve fakture

  return v_company;
end $$;
grant execute on function public.create_company_self(text, text, text) to authenticated;
