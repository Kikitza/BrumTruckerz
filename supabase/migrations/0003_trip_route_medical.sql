-- 0003_trip_route_medical.sql
-- 1) Ruta ture: zasebna polazna/odredišna tačka (forma više ne traži slobodan "title").
--    title ostaje radi kompatibilnosti (prikazi/izvozi); kod ga generiše kao
--    "origin → destination" pri kreiranju ture.
-- 2) Vozač: datum početka rada.
--
-- NAPOMENA: lekarsko uverenje NIJE kolona na drivers — to je ROK i živi u tabeli
-- reminders (subject_type='driver', category='medical', kind='date', due_date).
-- Zato se ovde ne dodaje nikakva "medical" kolona.

alter table trips   add column if not exists origin      text;
alter table trips   add column if not exists destination text;

alter table drivers add column if not exists employment_start date;
