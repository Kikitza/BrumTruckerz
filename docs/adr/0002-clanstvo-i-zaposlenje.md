# ADR 0002 — Članstvo i zaposlenje

## KONTEKST (danas u kodu/šemi)
- Pripadnost firmi je **jedna kolona**: `app_users.company_id` (`0001_init.sql:38`), `null` samo za `platform_admin` (constraint `app_users_company_by_role`, `0014:14-16`).
- `drivers` nosi `company_id` + opciono `user_id` (`0001:70-80`); vozač „pripada" tačno jednoj firmi preko tog reda.
- Nalog vozača pravi vlasnik kroz Edge `create-driver-account`; nema pojma pozivnice ni istorije zaposlenja (od–do). Promena firme danas znači ručno prevezivanje.

## ODLUKA
- Vozač i dispečer su **građani platforme**; veza sa firmom je **Zaposlenje (Employment)** sa istorijom `od–do`, koje **preživljava promene firmi** (ostaje trag gde je i kada radio).
- Firma **poziva** (POZIVNICA) → prihvatanje → **aktivno zaposlenje**. Postojeće „vlasnik pravi nalog" ostaje **pomoćni most** dok se tok pozivnica ne ustali.
- **Odbačeno:** (a) zadržati samo `app_users.company_id` — briše istoriju i ne podržava jednog vozača kroz više firmi kroz vreme; (b) M:N bez vremena (prosta spojna tabela) — ne odgovara na „ko je radio u firmi tog meseca" (bitno za performans/rollup po mesecu, `driver_month_rollup`).

## SKICA ŠEME (nacrt)
```
employments
  id          uuid pk
  profile_id  uuid  → user_profiles(user_id)   -- vozač/dispečer (ADR 0001)
  company_id  uuid  → companies(id)
  role        user_role                         -- 'driver' | 'dispatcher'
  started_on  date  not null
  ended_on    date  null                        -- null = aktivno
  status      text                              -- 'active' | 'ended'
  unique (profile_id, company_id, started_on)
invitations
  id, company_id, target (email|telefon|BT-D), role, token, status, expires_at
-- indeks: (company_id, status), (profile_id, ended_on)
-- MOST: app_users.company_id ostaje; za vozača = firma iz AKTIVNOG employment-a
```

## MIGRACIONI PUT (bez prekida)
1. Aditivno: `employments`, `invitations`.
2. Backfill na stagingu: za svakog `drivers` sa `user_id` napravi `employment(active)` (`started_on` = `drivers.employment_start` ako postoji, `0003:14`).
3. RLS i tokovi nastavljaju da čitaju `app_users.company_id` (most); postepeno se izvor pripadnosti prebacuje na aktivni `employment`.
4. PROD uz odobrenje; nijedan postojeći vozač ne sme da „ispadne" iz firme tokom prelaza.

## TESTOVI ČUVARI
- test:db: aktivan employment ↔ `app_users.company_id` saglasnost; zatvaranje (`ended_on`) ne briše istoriju; vozač sa 2 istorijska zaposlenja i dalje ima tačno jedno aktivno.
- jest: logika „aktivan employment" (od–do, null=aktivno).

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
