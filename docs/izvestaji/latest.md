# IZVEŠTAJ — v2-2 ZBIRNI SYNC NA PROD (uwphmxxeuggitssdmgcz)

> Izričito odobrenje vlasnika (lepljenjem). Izvršen „TAČAN RECEPT ZA PROD" doslovno, sa STOP-kapijama. Link vraćen na DEV (dokaz dole). **Nijedna tajna-vrednost nije u ovom izveštaju.**

## 1) Kapija: stanje + dry-run (bez odstupanja) → push
- PROD remote pre: istorija do **0026** (očekivano).
- `db push --dry-run` → **TAČNO**: `0027, 0028, 0029, 0030, 0031, 0032, 0033`. Bez odstupanja → nastavljeno.
- Push: svih 7 migracija primenjeno bez greške.

### PRE/POSLE (aditivnost; pravi podaci netaknuti)
| Tabela | PRE | POSLE |
|---|---:|---:|
| companies | 1 | 1 |
| app_users | 1 | 1 |
| drivers | 1 | 1 |
| vehicles | 5 | 5 |
| trips | 0 | 0 |
| customers | 0 | 0 |
| invoices | 0 | 0 |
| reminders | 4 | 4 |
| **outbox_events** (nova) | — | **0** |
| **audit_log** (nova) | — | **0** |

Pravi podaci firme netaknuti; nove tabele prazne. **Aditivnost potvrđena.**

## 2) CRON_SECRET + Edge funkcije
- `CRON_SECRET` **već postoji na PROD** (od „push finala", 2026-08-20) — nije menjan. (`secrets list` prikazuje digeste, ne plaintext; plaintext NIJE u ovoj sesiji.)
- `functions deploy` na PROD (`--no-verify-jwt`): **`reminders-cron`** (nova verzija sa `reminder.due` emisijom) + **`outbox-worker`** (nov). Obe potvrđene „Deployed".

## 3) Smoke posle primene (PROD)
- `test.ok` kroz `emit_outbox_event` → **dospeo u `outbox_events` I `audit_log`** (emit puni obe tabele — potvrđeno).
- Pipeline do „processed": `outbox_claim_batch` uzeo red → `outbox_mark_processed` → **`processed_at` postavljen**; upit „zaglavljenih" (`attempts>=5`) = **0** (prazan).
- **Napomena o smoke-u:** HTTP POST na worker (`.../functions/v1/outbox-worker` sa `x-cron-secret`) je **vlasnikov korak** — plaintext tajne nije u sesiji; identičan deploy je uživo dokazan HTTP-om na STAGING-u (prethodni izveštaj: claimed/processed/dead-letter/401). Na PROD-u je DB pipeline (`emit → claim → processed`) dokazan direktno preko istih RPC-ova koje worker zove.
- **Test red OČIŠĆEN:** `test.ok` obrisan iz `outbox_events` i `audit_log` → obe tabele nazad na **0**; pravi podaci netaknuti (companies 1 / drivers 1 / vehicles 5 / reminders 4).

## 4) Link vraćen na DEV (dokaz)
- `supabase link --project-ref icbjagubaftoqcwfcbwf` → **LINK: `icbjagubaftoqcwfcbwf` (DEV)**, DEV potvrđen na `0033`.

---

## ČEKA VLASNIKA — jedan klik (Dashboard PROD → Cron)
> Baza + funkcije su na PROD-u. Ostaje samo raspored worker-a (isti mehanizam kao postojeći reminders-cron job).

1. Dashboard PROD (`uwphmxxeuggitssdmgcz`) → **Cron** → **New job**.
2. Raspored: **`*/5 * * * *`** (na 5 minuta).
3. Akcija: **POST** na
   `https://uwphmxxeuggitssdmgcz.supabase.co/functions/v1/outbox-worker`
   sa headerom **`x-cron-secret: <PROD CRON_SECRET>`** (vrednost je ona koju si postavio na „push finalu"; asistent ti je pokazuje u terminalu, nikad u izveštaj).
4. Proveri da **postojeći `reminders-cron` job i dalje stoji** (ostaje kako jeste; sad dodatno emituje `reminder.due`).

Posle uključenja cron-a, worker svakih 5 min obrađuje evente. Provera „zaglavljenih" (kad zatreba):
`select id, event_type, attempts, error from outbox_events where processed_at is null and attempts>=5;`

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| Dry-run PROD = 0027–0033 | ✅ tačno, bez odstupanja |
| Push PROD (7 migracija) | ✅ aditivno; pravi podaci netaknuti; nove tabele prazne |
| CRON_SECRET na PROD | ✅ postoji (nije menjan) |
| Edge deploy PROD (2 fn) | ✅ reminders-cron + outbox-worker |
| Smoke: emit → outbox + audit | ✅ |
| Smoke: claim → processed; stuck prazan | ✅ |
| Test red očišćen (tabele = 0) | ✅ |
| **Link vraćen na DEV** | ✅ `icbjagubaftoqcwfcbwf` (0033) |
| Tajne-vrednosti u izveštaju | ❌ NE (samo imena/mesta) |
| Preostaje vlasniku | Cron job `*/5` za worker (jedan klik) |
