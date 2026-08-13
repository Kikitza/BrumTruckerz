-- 0004_reminders_label_issued.sql
-- Rokovi (reminders) dobijaju dva opciona polja:
--   * label     — slobodan naziv za custom stavke ("Ostali rokovi"); NULL za predefinisane kategorije.
--   * issued_at — datum izdavanja/atesta (npr. PP aparat "atestiran"); NULL kada nije relevantno.
-- Tabele vehicles/trailers se NE diraju — svi rokovi žive u reminders (polimorfno preko subject_id).

alter table reminders add column if not exists label     text;
alter table reminders add column if not exists issued_at date;
