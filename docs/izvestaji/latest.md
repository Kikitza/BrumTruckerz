# IZVEŠTAJ — KAPIJA F2 / KORAK 1: PROD SYNC (uwphmxxeuggitssdmgcz)

> STATUS: **URAĐENO na PRODU** (izričito odobrenje vlasnika). Migracije 0021–0025 primenjene; `vies-check`
> deploy-ovana. **Link vraćen na DEV** (dokaz niže). Bez izmena koda. Auth PRODA **nedirnut**. `reminders-cron`
> **svesno izostavljen** (ide uz push-finale ritual). Izveštaj sadrži samo imena/refove — **nijednu tajnu-vrednost**.

## Rezultat: ✅ F2 SINHRONIZOVAN NA PROD
PROD je bio na **0001–0020 sa urednom istorijom** (STOP-kapija „utvrdi stanje" → OK). Push čist iz prvog puta,
sve aditivno, postojeći podaci netaknuti.

## 1) Stanje pre (STOP-kapija) + dry-run
- `supabase_migrations.schema_migrations` = **tačno 0001…0020** (20 redova). Očekivano.
- **Dry-run = TAČNO 0021, 0022, 0023, 0024, 0025** (bez odstupanja → nastavak):
```
 • 0021_customers.sql
 • 0022_customers_vies.sql
 • 0023_invoices.sql
 • 0024_reminder_types_km.sql
 • 0025_countries_vehicle_types_self_serve.sql
```

## 2) Push + PRE/POSLE (aditivnost)
| Tabela | PRE | POSLE |
|---|---|---|
| companies | 1 | 1 |
| app_users | 1 | 1 |
| auth.users | 3 | 3 |
| drivers | 1 | 1 |
| vehicles | 5 | 5 |
| trailers | 1 | 1 |
| trips | 0 | 0 |
| reminders | 4 | 4 |
| driver_profiles / employments | 0 / 0 | 0 / 0 |

**Nove tabele (prazne):** customers 0, invoices 0, invoice_settings 0. **Nijedan `db push` u 0021–0025 ne radi
backfill podataka** → svi postojeći brojevi nepromenjeni (čisto aditivno).

## 3) Read-only verifikacija PRODA (bez test:db — po nalogu)
| Provera | Vrednost |
|---|---|
| istorija (applied max) | **0025** |
| šifarnici (seed) | countries **41**, vehicle_types **9**, reminder_types **12** |
| funkcije prisutne | `issue_invoice` ✅, `create_company_self` ✅, `next_invoice_no` ✅ |
| nove kolone | `trips.customer_id` ✅, `vehicles.type_id` ✅, `companies.country_code` ✅, `reminders.mode` ✅ |
| customers/invoices/invoice_settings | tabele prisutne (0 redova) |

`test:db` **NIJE** puštan na PRODU (samo read-only verifikacija, po zadatku).

## 4) Edge / Auth
- **`vies-check` deploy-ovana na PROD.**
- **`reminders-cron` SVESNO IZOSTAVLJENA** — ide uz „push-finale" ritual (kad se puštaju sledeće migracije/notif izmene),
  da se cron ne razdvaja od svog konteksta. Trenutno na PRODU radi prethodna (0012) verzija crona; km-rokovi kreću tek
  po njenom redeployu. Na DEV-u je nova (km) verzija.
- **Auth PRODA NEDIRNUT** (nijedan Management API poziv nad PRODOM; telefon/autoconfirm ostaju isključeni).

## 5) Link vraćen na DEV (dokaz)
```
LINKED → BrumTruckerz-dev           icbjagubaftoqcwfcbwf
         BrumTruckerz-staging       webquovijioxmouvuiko
         (PROD)                     uwphmxxeuggitssdmgcz
```
`supabase/.temp/project-ref = icbjagubaftoqcwfcbwf`.

## Stanje migracija (sve tri baze)
- **DEV:** 0001–0025. **STAGING:** 0001–0020 (F1 proba). **PROD:** 0001–0025 (**ovaj sync**).

## Rollback (PROD, ako zatreba)
Aditivno; enum se ne dira. Po potrebi obrnutim redom: `create_company_self`/`countries`/`vehicle_types` (0025) →
`invoices`/`issue_invoice`/`next_invoice_no`/counteri (0023) → `customers` (0021); VIES kolone (0022) i reminder_types+km
kolone (0024) su prazne/dodatne i bezbedne za ostajanje.

## Jezici
i18n **nije diran** (samo baza/deploy).

## Kvalitet
STOP-kapije poštovane (istorija → dry-run tačno 0021–0025 → PRE/POSLE); nijedna tajna-vrednost nije zapisana; `reminders-cron`
svesno izostavljen i to je jasno naznačeno; link vraćen na DEV.

## ČEKA SE (potez vlasnika)
1. **KAPIJA F2 / KORAK 2** (kad odlučiš): `functions deploy reminders-cron` na PROD (km-rokovi), uz odobrenje.
