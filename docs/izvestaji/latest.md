# IZVEŠTAJ — F3: TEST IZDRŽLJIVOSTI (staging volumen + server paginacija & indeksi)

> STATUS: **URAĐENO** — staging (webquovijioxmouvuiko) seed-ovan i izmeren; server paginacija + indeksi.
> **Link vraćen na DEV** (dokaz niže). **PROD NIJE diran.** Provere čiste; mobilno netaknuto.

## 1) Staging sync
- Dry-run = **tačno 0021–0025** (istorija od F1 probe) → push. Zatim **0026** (indeksi, niže).
- **Edge funkcije za ovaj test NISU potrebne** (mere se listni upiti/paginacija; vies-check/reminders-cron nebitni) — naznačeno.

## 2) SEED (samo staging, idempotentno, „[SEED]")
- **`supabase/STAGING-SEED.sql`** (u repou): idempotentan (prvo briše `[SEED]` firmu → CASCADE), sve nosi „[SEED]".
  - **Pokretanje:** `supabase db query --linked -f supabase/STAGING-SEED.sql` (staging linkovan).
  - **Čišćenje:** `delete from companies where name like '[SEED]%'; delete from auth.users where email like '%@brumtruckerz.seed';`
- **Volumen (potvrđen):** **1200 tura**, **48.000 događaja**, **4800 troškova**, **300 faktura** (mix statusa), **30 naručilaca**,
  20 vozila / 15 prikolica / 10 vozača, **60 rokova** (datum + km), kroz 12 meseci (mix aktivne/završene).

## 3) MERENJA (EXPLAIN ANALYZE — server-strana; UI render se ne meri headless)
> Mereno sa `company_id` filterom (ogledalo RLS-a; RLS dodaje keširan `current_company_id()` — zanemarivo).
> Cilj „lista ≲1s" — server-strana je u **mikrosekundama**; ključni dobitak je **ograničen payload** (50 redova) + eliminisan Sort.

| Lista (upit) | PRE | POSLE |
|---|---|---|
| Ture — kartice (limit 50) | 0.203 ms | 0.203 ms (nepromenjeno; već paged) |
| Ture — RICH tabela | 0.883 ms (limit **200**) | **0.538 ms** (limit 50) |
| **Fakture** | 0.607 ms (**BEZ limita**, ~300; **Seq Scan + Sort**) | **0.242 ms** (limit 50; **index**, bez Seq Scan/Sort) |
| Naručioci | 0.723 ms | 0.606 ms (limit 50) |
| **Arhiva** (finished) | 0.899 ms (**BEZ limita**, ~840) | **0.249 ms** (limit 50; index) |
| Admin — lista firmi | 0.108 ms (2 firme; seed vidljiv: 20 voz/10 voz.) | — |

## 4) ISPRAVKE
- **SERVER PAGINACIJA („Učitaj još", stranice 50):**
  - **Ture** — obe varijante: mobilne kartice (**aktivne** + **arhiva** zasebni server upiti, svaki „Učitaj još"; arhiva se učitava tek na otvaranje) i **web tabela** (rich, raste limit).
  - **Fakture** i **Naručioci** — `.limit(shown)` + „Učitaj još" (raste po 50).
  - Deljena `LoadMore` komponenta; `common.loadMore` u i18n (30 jezika).
- **`supabase/migrations/0026_list_paging_indexes.sql`** — `invoices (company_id, issue_date desc, invoice_no desc)`
  (fakture: eliminisan Seq Scan + Sort) i `trips (company_id, status, created_at desc)` (arhiva: index-order paging).
- **`driver_trips`** — **po prirodi mali** (view filtrira `driver_id = current_driver_id()` → samo turе jednog vozača);
  ne treba paginacija ni indeks. (Provereno.)
- **Indeksi gde je explain pokazao Seq Scan:** samo `invoices` (300 redova → Seq Scan+Sort) je opravdavao namenski indeks;
  ostali Seq Scan-ovi su nad **sićušnim** tabelama (drivers 10) gde je Seq Scan ispravan izbor planera (indeks ne bi pomogao).

## 5) Kapija: admin na webu
- `admin_list_companies` je bounded RPC (broj firmi mali; per-firma count-ovi indeksirani); **web-safe** (samo RPC, bez native).
  Podaci potvrđeni: seed firma se vidi u listi (status active, 20 vozila/10 vozača). *Živi klik admin-prijave = `expo start --web`.*

## 6) Mobilno / link
- Mobilno **nije pokvareno**: paginacija radi i sa malo podataka (na DEV-u/Expo Go „Učitaj još" se ne prikazuje dok ima < 50).
  Sve grane su iste kao pre za male skupove; native tok nepromenjen.
- **Link vraćen na DEV** (`supabase/.temp/project-ref = icbjagubaftoqcwfcbwf`).

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ | 
| `npm test` (jest) | ✅ 121 |
| `npm run lint` | ✅ 0 grešaka |
| `npm run test:db` (DEV) | ✅ ALL PASSED |
| `expo export --platform web` | ✅ bez grešaka |
| Staging seed + merenja | ✅ (tabela gore) |

## Migracije — ručna primena
- **DEV:** 0026 primenjena. **STAGING:** 0026 primenjena (za test). **PROD:** **nije** — `db push` 0026 uz odobrenje (aditivno, samo indeksi).

## Jezici
i18n **dopunjen u SVIH 30** — `common.loadMore`.

## Kvalitet koda
Deljene `LoadMore`/`DataTable`/`DesktopContainer`; paginacija kroz `.limit(shown)` (jednostavno, server-strana, ograničen payload);
bez duplirane logike; native tok očuvan.

## ČEKA SE (potez vlasnika)
1. `db push` 0026 na PROD (indeksi) uz odobrenje.
2. (opciono) čišćenje staging seed-a po `[SEED]` kad test više ne treba.
