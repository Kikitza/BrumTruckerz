# IZVEŠTAJ — PROD: outbox-worker CRON zakazan SQL-om (pg_cron)

> Umesto vlasnikovog ručnog klika — zakazano `cron.schedule` SQL-om (odobreno). PROD `uwphmxxeuggitssdmgcz`. Link vraćen na DEV. **Bez tajni** (samo ime vault unosa).

## Šta je urađeno
1. Pročitan postojeći posao `reminders-cron-daily` (jobid 1, `0 5 * * *`) → prekopiran oblik: `net.http_post` + `x-cron-secret` iz **`vault.decrypted_secrets` name `cron_reminders_secret`** (isti vault unos — worker čita istu tajnu iz `CRON_SECRET` env-a, pa nema 401).
2. `cron.schedule('outbox-worker-every-5min', '*/5 * * * *', …POST .../functions/v1/outbox-worker…)` (jobid 2) — identičan obrazac, header iz istog vault secret-a. **Nigde plaintext tajne.**

## Verifikacija
- `select jobname, schedule from cron.job` → **OBA posla stoje, aktivna:** `reminders-cron-daily` (`0 5 * * *`, netaknut) + `outbox-worker-every-5min` (`*/5 * * * *`).
- Prvi ciklus odradio (10:25:00 UTC): `cron.job_run_details` status **succeeded**; HTTP odgovor **200** (BEZ 401 — vault auth radi); `outbox_unprocessed=0`, „zaglavljenih"=0.

## Stanje
- Worker se sada poziva **svakih 5 min** na PROD-u i obrađuje evente; retencija (`outbox_prune(30)`) ide u svakom ciklusu.
- **Link: DEV** (`icbjagubaftoqcwfcbwf`, 0033).
- Zaustavljanje (kad zatreba): `select cron.unschedule('outbox-worker-every-5min');`.

| Provera | Rezultat |
|---|---|
| Nov posao `*/5` kreiran | ✅ jobid 2 |
| `reminders-cron-daily` netaknut | ✅ `0 5 * * *` |
| Prvi ciklus: worker 200 (ne 401) | ✅ succeeded |
| outbox prazan / stuck 0 | ✅ |
| Link vraćen na DEV | ✅ |
| Tajne u izveštaju | ❌ NE (samo ime vault unosa) |
