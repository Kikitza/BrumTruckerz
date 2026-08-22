# IZVEŠTAJ — v2-2 kriška 3: OUTBOX WORKER (claim, retry, dead-letter, prune)

> Završna kriška event/outbox sloja (ADR 0012 §5b). „Primi" (trigeri) razdvojeno od „obradi" (worker). **Sve na DEV.**

## 1) Migracija 0033 — worker RPC-ovi (na DEV)
- **`outbox_claim_batch(limit, max_attempts)`** — atomičan **lease**: `FOR UPDATE SKIP LOCKED` + `attempts+1` u istoj transakciji. Paralelni workeri preskaču zaključane redove i, pošto je `attempts` uvećan pri claim-u, ne uzimaju istu grupu. Vraća redove workeru; obrada ide POSLE, van locka (handleri zovu spoljne servise).
- **`outbox_mark_processed(id)`** (processed_at=now, error=null) i **`outbox_mark_error(id, msg)`** (upis poruke; attempts je već uvećan pri claim-u).
- Svi `revoke from public` + `grant to service_role`. `outbox_prune(30)` (0029) worker zove na kraju.
- **Zašto lease-na-claim, ne processed-markiranje unapred:** handler radi spolja (HTTP) → lock se ne može držati preko mreže; lease (attempts++) daje bezbedan claim + prirodan brojač pokušaja za dead-letter, bez gubitka retry-a na padu.

## 2) Edge funkcija `outbox-worker` (deployed na DEV)
- **Isti bezbednosni obrazac kao reminders-cron:** `x-cron-secret == CRON_SECRET` (fail-closed 401), service_role, `--no-verify-jwt`.
- **HANDLER registar po `event_type`:** v1 su MINIMALNI (no-op/log; nepoznat tip → no-op uspeh → mark processed da se ne gomila). Struktura spremna: sutra `reminder.due → push`, `invoice.paid → notifikacija` su **samo novi unos u `HANDLERS`**, bez diranja petlje. (Ostavljeni i `test.ok`/`test.boom` za smoke.)
- **Petlja:** claim(50, MAX 5) → za svaki red nezavisno: handler → uspeh `mark_processed` / pad `mark_error` (attempts već uvećan) → na kraju `outbox_prune(30)`.
- **Dead-letter (obrazac iz offline reda A4):** claim uzima samo `attempts < 5`; na 5 red ostaje neobrađen ali se VIŠE NE uzima → preskočen, ne blokira ostale (svaki red nezavisan).
- **At-least-once → handleri moraju biti idempotentni** (ADR §3).

## 3) Kako se pušta / zaustavlja / nadzire
**Pokretanje (ručni okidač / smoke — traži CRON_SECRET, drži ga vlasnik):**
```
curl -i -X POST "https://icbjagubaftoqcwfcbwf.supabase.co/functions/v1/outbox-worker" \
     -H "x-cron-secret: <CRON_SECRET>"
# → {"claimed":N,"processed":N,"failed":N,"pruned":N}
```
**Raspored (na 5 min) — vlasnikov korak (isti mehanizam kao reminders-cron):** Supabase Dashboard → **Cron** → novi job `*/5 * * * *`, POST na gornji URL sa headerom `x-cron-secret`. (Ne ide u repo jer nosi tajnu; reminders-cron je zakazan istim putem.)
**Zaustavljanje / pauza:** isključi/obriši cron job u Dashboard-u (worker prestaje da se poziva); potpuno uklanjanje = `supabase functions delete outbox-worker`.

**Smoke dead-letter (posle rasporeda):** ubaci `test.boom` event → worker ga uzima svaki ciklus, `attempts` raste, posle 5 preskočen; `test.ok`/ostali normalno `processed`.

**Vidljivost „zaglavljenog" eventa (dead-letter) — upit:**
```sql
-- Zaglavljeni: neobrađeni koji su iscrpeli pokušaje (za istragu; ručno resetuj attempts=0 za ponovni pokušaj)
select id, event_type, company_id, attempts, error, occurred_at
  from outbox_events where processed_at is null and attempts >= 5 order by occurred_at;
-- Zaostatak (backlog, još „živi"):
select count(*) from outbox_events where processed_at is null and attempts < 5;
```

## 4) Testovi čuvari
- **test:db** — nova `outbox_worker_test.sql`: (1) claim = lease (attempts+1); (2) uspeh → `processed_at`, ne claim-uje se ponovo; (3) greška → `error` zapisan, ostaje neobrađen; (4) **dead-letter** na MAX → isključen iz claim-a, **ostali (e2) i dalje teku** (ne-blokiranje); (5) **prune** briše star obrađen (40 dana), čuva neobrađen. → cela svita **ALL PASSED (13 suita)**.
- **Napomena:** prava paralelna bezbednost (`SKIP LOCKED` između dve sesije) ne dokazuje se u jednoj transakciji; dokazani su lease, isključivanje obrađenih, dead-letter i ne-blokiranje.
- jest 136/136, typecheck ✓, lint 0 grešaka (server-side kriška; `src`/i18n **netaknuti**).

## PODSETNIK — šta čeka PROD (uz izričito odobrenje)
- **Migracije 0027 → 0033** (7 kom): career, trip-countries, outbox+trigeri, puna pokrivenost, audit_log, worker RPC-ovi.
- **Grant** `emit_outbox_event` → `service_role` (u 0031) ide sa migracijama.
- **Edge deploy:** `reminders-cron` (redeploy — nosi `reminder.due`) + `outbox-worker` (nov).
- **Rasporedi:** `outbox-worker` na 5 min (nov cron job); `reminders-cron` postojeći ostaje.
- Redosled: STAGING (proba) → PROD. Rollback svake migracije naveden u ranijim izveštajima (drop trigger/function/table; kolone aditivne).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 136/136 |
| `npm run test:db` (DEV) | ✅ ALL PASSED (13 suita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| i18n | ✅ netaknut (server-side kriška) |
| Claim bezbedan od paralele | ✅ FOR UPDATE SKIP LOCKED + lease (attempts++) |
| Dead-letter ne blokira ostale | ✅ dokazano u testu |
| Handler registar proširiv bez diranja petlje | ✅ nov event = nov unos u `HANDLERS` |
| Kvalitet: slojevi | ✅ worker server-side; nema server-logike u `src` (ne bundluje se u klijent) |
| Link ostao na DEV | ✅ |
