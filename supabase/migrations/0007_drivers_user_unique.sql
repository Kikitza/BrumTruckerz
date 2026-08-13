-- 0007_drivers_user_unique.sql
-- Zaštita invarijante koju current_driver_id() PRETPOSTAVLJA: jedan auth nalog =
-- najviše jedan vozač u floti. Bez ovoga, ako je nalog slučajno vezan za >1 drivers
-- red (npr. duplirano povezivanje), current_driver_id() vraća PROIZVOLJAN red, pa
-- driver_trips može vratiti 0 tura iako vozač ima dodeljene ture.
--
-- VAŽNO: pre primene ukloni eventualne duplikate (v. IZVESTAJ.md — korak „odveži pogrešne
-- veze"), inače kreiranje jedinstvenog indeksa puca na postojećim duplikatima.

create unique index if not exists drivers_user_id_uidx
  on drivers (user_id)
  where user_id is not null;
