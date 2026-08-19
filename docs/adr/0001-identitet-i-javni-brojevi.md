# ADR 0001 — Identitet i javni brojevi

## KONTEKST (danas u kodu/šemi)
- Identitet je Supabase `auth.users`; `app_users` ga preslikava na ulogu + firmu (`0001_init.sql:36-43`), `app_users.phone` je običan tekst (`:41`).
- Uloge: enum `user_role ('platform_admin','owner','driver')` (`0001:15`).
- `drivers` je **zaseban HR entitet** firme, opciono vezan za nalog preko `user_id` (`0001:70-80`); `drivers_user_id_uidx` garantuje „1 nalog = najviše 1 vozač" (`0007`), na čemu počiva `current_driver_id()` (`0001:238`).
- Nema trajnog javnog broja; ime (`drivers.full_name`, `app_users.full_name`) nije jedinstveno. Nalog vozača pravi Edge `create-driver-account`.

## ODLUKA
- Uvodi se **trajni javni identifikator vozača `BT-D-XXXXX`**, vezan za **nalog/profil**, ne za broj telefona. Telefon postaje samo kanal za prijavu (v. 0001 ulaz u ADR 0003 uloge / SMS) i **menja se bez gubitka identiteta i istorije**.
- Model: `User (auth)` → **profili**: `DriverProfile` (BT-D broj, ime) i `DispatcherProfile`. Profil je nadskup postojeće `drivers` veze i živi kroz promene firmi (v. ADR 0002).
- **Odbačeno:** (a) telefon kao identitet/PK — pada čim vozač promeni broj; (b) ime+prezime kao ključ — nisu jedinstveni; (c) `drivers.id` kao javni broj — `drivers` je red po firmi, a vozač-građanin postoji iznad firmi.

## SKICA ŠEME (nacrt)
```
user_profiles
  user_id      uuid  pk  → app_users(id)
  public_no    text  unique     -- format 'BT-D-#####' (vozač); dispečer po potrebi
  kind         text            -- 'driver' | 'dispatcher'
  display_name text
  created_at   timestamptz
-- generator public_no: platform-sekvenca (monoton broj) + prefiks/format u kodu
-- telefon OSTAJE u auth.users / app_users.phone (promenjiv), NIJE deo ključa
```

## MIGRACIONI PUT (bez prekida)
1. Aditivna migracija: `user_profiles` (ništa se ne ruši).
2. Backfill na stagingu: svakom postojećem vozaču (`drivers` sa `user_id`) dodeli `public_no`; proveri unikatnost.
3. Stara veza `app_users → drivers.user_id` ostaje **most** dok F1 ne prebaci tokove na profil.
4. PROD tek uz izričito odobrenje; brojevi se ne recikliraju.

## TESTOVI ČUVARI
- jest: validator formata `BT-D-XXXXX`.
- test:db: `unique(public_no)`; promena `app_users.phone`/telefona **ne menja** `public_no` niti veze ka turama; invarijanta „1 nalog = 1 vozač" (`0007`) i dalje drži.

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
