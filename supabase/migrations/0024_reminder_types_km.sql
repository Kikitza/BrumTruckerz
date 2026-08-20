-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 — ŠIFARNIK TIPOVA ROKOVA + SERVIS PO KILOMETRAŽI. F2. Aditivno, na postojeći motor.
--
--   (A) reminder_types — šifarnik tipova po struci (code jedinstven, subject_kind, name_key za
--       i18n, default_interval_months, needs_country, sort). SEED (izvor: audit dokument + tržišna
--       analiza; intervali obrazloženi u izveštaju). RLS: svi authenticated ČITAJU; menja SAMO
--       platforma (nema klijentskih write politika — kao restrictions/resources, 0001).
--   (B) reminders + type_id (null FK → reminder_types; null = „prilagođen", staro ponašanje zauvek
--       legalno) + country_code text(2) (za needs_country tipove, npr. vinjeta AT/HU/SI).
--   (C) reminders + mode date|km (default date) + due_km numeric — SERVIS PO KM za vozila.
--
-- POSTOJEĆI rokovi ostaju netaknuti (type_id null, mode 'date'). RLS reminders (reminders_tenant,
-- 0020 office) se ne menja — nove kolone kroz istu izolaciju.
-- ─────────────────────────────────────────────────────────────────────────────

create table reminder_types (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique,
  subject_kind            text not null check (subject_kind in ('vehicle','trailer','driver')),
  name_key                text not null,           -- i18n ključ (reminders.type.<code>)
  default_interval_months int,                      -- predlog intervala (null = bez predloga)
  needs_country           boolean not null default false,
  sort                    int not null default 0,
  created_at              timestamptz not null default now()
);
alter table reminder_types enable row level security;
-- Čitaju SVI ulogovani (šifarnik je globalni referentni podatak). NEMA write politike → klijent ne piše.
create policy reminder_types_read on reminder_types for select using (auth.uid() is not null);

-- ── SEED (struka) ──
-- VOZAČ: CPC (Kôd 95) 5 god; tahograf kartica vozača 5 god; lekarsko (interval po dobi → bez predloga);
--        ADR sertifikat vozača 5 god.
-- VOZILO: tehnički pregled 12 mes; registracija 12 mes; kalibracija tahografa 24 mes (EU 2 god);
--         ADR vozila 12 mes; PP aparat 12 mes; vinjeta (needs_country, važenje varira → bez predloga).
-- PRIKOLICA: tehnički 12 mes; registracija 12 mes.
insert into reminder_types (code, subject_kind, name_key, default_interval_months, needs_country, sort) values
  ('cpc',               'driver',  'reminders.type.cpc',               60, false, 10),
  ('tacho_card',        'driver',  'reminders.type.tacho_card',        60, false, 20),
  ('medical',           'driver',  'reminders.type.medical',           null, false, 30),
  ('adr_driver',        'driver',  'reminders.type.adr_driver',        60, false, 40),
  ('technical',         'vehicle', 'reminders.type.technical',         12, false, 10),
  ('registration',      'vehicle', 'reminders.type.registration',      12, false, 20),
  ('tacho_calibration', 'vehicle', 'reminders.type.tacho_calibration', 24, false, 30),
  ('adr_vehicle',       'vehicle', 'reminders.type.adr_vehicle',       12, false, 40),
  ('fire_extinguisher', 'vehicle', 'reminders.type.fire_extinguisher', 12, false, 50),
  ('vignette',          'vehicle', 'reminders.type.vignette',          null, true,  60),
  ('trailer_technical', 'trailer', 'reminders.type.trailer_technical', 12, false, 10),
  ('trailer_registration','trailer','reminders.type.trailer_registration', 12, false, 20);

-- ── reminders: veza na tip + zemlja + režim km ──
alter table reminders add column type_id      uuid references reminder_types(id) on delete set null;
alter table reminders add column country_code text;                               -- 2 slova (needs_country)
alter table reminders add column mode         text not null default 'date' check (mode in ('date','km'));
alter table reminders add column due_km       numeric;                            -- servis po km (vozila)
create index on reminders (company_id, type_id);
