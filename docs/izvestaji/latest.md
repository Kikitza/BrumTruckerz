# IZVEŠTAJ — v2-2 FINALE: GENERALNA PROBA ZBIRNOG SYNC-a NA STAGINGU

> Odobreno lepljenjem (vlasnik). Meta: **STAGING** `webquovijioxmouvuiko`. **PROD nije diran.** Link vraćen na DEV na kraju (dokaz dole).

## 1) Stanje + dry-run (bez odstupanja)
- Staging remote pre probe: istorija do **0026** (od perf testa) — kako je očekivano.
- `db push --dry-run` → **TAČNO**: `0027, 0028, 0029, 0030, 0031, 0032, 0033`. Bez odstupanja → nastavljeno.

## 2) Push + PRE/POSLE (sve aditivno, seed netaknut)
Svih 7 migracija primenjeno na staging bez greške.

| Tabela | PRE | POSLE |
|---|---:|---:|
| companies | 2 | 2 |
| app_users | 2 | 2 |
| drivers | 11 | 11 |
| vehicles | 25 | 25 |
| trips | 1200 | 1200 |
| customers | 30 | 30 |
| invoices | 300 | 300 |
| reminders | 64 | 64 |
| **outbox_events** (nova) | — | **0** |
| **audit_log** (nova) | — | **0** |

[SEED] podaci netaknuti; nove tabele prazne. **Aditivno potvrđeno.**

## 3) Edge na staging
- `reminders-cron` (nova verzija sa `reminder.due` emisijom) + `outbox-worker` deploy-ovani na staging.
- Staging `CRON_SECRET` postavljen (vrednost **samo u sesiji**, u scratchpad-u — nikad u repo/izveštaj).

## 4) SMOKE end-to-end na stagingu — ishodi
- **Promena statusa [SEED] ture** (finished→driving) → **1 red u `outbox_events` I 1 u `audit_log`** (`trip.status_changed`, payload `prev/status`, actor null jer je SQL kontekst).
- **Worker ručno** (POST + `x-cron-secret`) → `{"claimed":1,"processed":1}`; event dobio `processed_at`. **Guard:** poziv bez tajne → **401** (fail-closed).
- **Dead-letter** (`test.boom` + jedan `test.ok`), 6 ciklusa worker-a:
  | ciklus | claimed | processed | failed |
  |---|---:|---:|---:|
  | 1 | 2 | **1** (test.ok teče) | 1 |
  | 2–5 | 1 | 0 | 1 (retry test.boom) |
  | 6 | **0** | 0 | 0 (test.boom na 5 → **preskočen**) |
  Završno: `test.boom` → `attempts=5`, `processed_at=null`, `error` zapisan, **red i dalje prisutan** (prune ne dira neobrađene); `test.ok` processed. „Zaglavljen" upit (`attempts>=5`) vraća 1.

## 5) test:db PROTIV STAGINGA
Svih **13 svita PROŠLO** na kopiji pravih podataka (rollback čist): rls_audit, correct_event_chain, identity, invitations, dispatcher, phone_change, customers, invoices, reminder_types, company_self, career, outbox, outbox_worker.

## 6) Link vraćen na DEV (dokaz) + staging očišćen
- Rehearsal artefakti obrisani sa staginga: seed tura vraćena na `finished`; `outbox_events`/`audit_log` ispražnjene → **outbox=0, audit=0**, seed netaknut (trips 1200 / invoices 300 / customers 30). (Napomena: restore ture kroz trigere je stvorio dodatne evente → očišćeni zasebnim sweep-om jer sibling-DELETE u istom upitu ne vidi trigerom-ubačene redove.)
- **Link: `icbjagubaftoqcwfcbwf` (DEV)**, DEV potvrđen na `0033`.

---

## TAČAN RECEPT ZA PROD
> Izvršava se TEK uz zaseban, izričit „kreni PROD" od vlasnika. PROD = `uwphmxxeuggitssdmgcz`. Isti koraci potvrđeni na stagingu.

**A. Migracije (baza)**
1. `supabase link --project-ref uwphmxxeuggitssdmgcz`
2. `supabase migration list --linked` → potvrdi remote do **0026**.
3. `supabase db push --linked --dry-run` → mora dati **TAČNO 0027–0033**. Odstupanje → STANI.
4. `supabase db push --linked` → primeni 7 migracija (sve aditivno; nove tabele prazne; seed/podaci netaknuti — proveri PRE/POSLE brojeve).

**B. Tajna + Edge funkcije**
5. `supabase secrets set CRON_SECRET=<PROD tajna>` (ako PROD još nema; vrednost van repo-a).
6. `supabase functions deploy reminders-cron --no-verify-jwt` (nosi `reminder.due`).
7. `supabase functions deploy outbox-worker --no-verify-jwt`.

**C. Rasporedi (vlasnik klikće u Dashboard-u PROD projekta → Cron)**
8. **Nov cron job za worker:** raspored `*/5 * * * *`, akcija **POST** na
   `https://uwphmxxeuggitssdmgcz.supabase.co/functions/v1/outbox-worker`,
   header `x-cron-secret: <PROD CRON_SECRET>`. (Isti mehanizam kao postojeći reminders-cron job.)
9. Proveri da `reminders-cron` job i dalje postoji (ostaje kako jeste).

**D. Provera posle primene (PROD)**
10. Smoke (opciono, van radnih sati): jedna promena → red u `outbox_events`+`audit_log`; ručni POST na worker → `processed`.
11. Nadzor „zaglavljenih": `select id, event_type, attempts, error from outbox_events where processed_at is null and attempts>=5;`

**Rollback (po potrebi, obrnutim redom):** `drop trigger *_outbox` + `drop function tg_*`, vrati `emit_outbox_event` na 0029 verziju, `drop table audit_log`, `drop table outbox_events` (kolone u trips/trip_stops su aditivne/nullable — mogu ostati); `supabase functions delete outbox-worker`; ukloni worker cron job.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| Dry-run staging = 0027–0033 | ✅ tačno, bez odstupanja |
| Push staging (7 migracija) | ✅ aditivno; seed netaknut; nove tabele prazne |
| Edge deploy staging (2 fn) + secret | ✅ |
| Smoke: event→outbox+audit→worker→processed | ✅ |
| Smoke: dead-letter (5→preskočen), ostali teku | ✅ |
| Smoke: auth guard 401 bez tajne | ✅ |
| `test:db` 13 svita PROTIV STAGINGA | ✅ ALL PASSED |
| Staging očišćen (outbox/audit prazne, seed ok) | ✅ |
| **Link vraćen na DEV** | ✅ `icbjagubaftoqcwfcbwf` (0033) |
| PROD diran? | ❌ NE (samo staging + dev) |
| Tajne u izveštaju? | ❌ NE (samo imena/mesta) |
