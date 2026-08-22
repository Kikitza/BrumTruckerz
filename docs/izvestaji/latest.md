# IZVEŠTAJ — v2-2 kriška 1: EVENT / OUTBOX temelj

> Prva kriška faze v2-2 (ADR 0012 PRIHVAĆENO). Durable outbox + prvi trigeri + prvi potrošač (živa tabla). **Sve na DEV.**

## 1) Migracija 0029 — `outbox_events` (na DEV)
- Tabela: `id, occurred_at, event_type, event_version, aggregate_type, aggregate_id, company_id, actor_user_id, payload jsonb, idempotency_key (unique), processed_at, attempts, error`.
- Indeksi: **parcijalni** `(occurred_at) where processed_at is null` (brzo uzimanje neobrađenih — budući worker) + `(company_id, occurred_at desc)` (živa tabla po firmi).
- **RLS:** office (owner/dispatcher) čita SAMO svoju firmu; **nema** insert/update/delete politike za `authenticated` → upis samo kroz SECURITY DEFINER helper (bez forging-a).
- `emit_outbox_event(...)` = jedini put upisa (SECURITY DEFINER, `revoke ... from public`); idempotency_key default = svež uuid (stabilan identitet reda za dedup kod potrošača) → **outbox insert nikad ne pada na ključu, pa nikad ne ugrožava poslovnu transakciju**.
- `outbox_prune(days=30)` retencija (briše OBRAĐENE starije od N dana; grant samo `service_role`). `audit_log` (§11) je sestrinska **trajna** tabela — dolazi u kasnijoj kriški.
- Realtime: `outbox_events` dodat u `supabase_realtime` publikaciju (idempotentno; Realtime poštuje RLS).

## 2) Migracija 0030 — trigeri (na DEV)
- **Presuda ADR §4:** trigeri na tabelama (ne emit-po-RPC) → pokrivaju **oba** puta upisa: direktan RLS upis **i** RPC/SECURITY DEFINER upis; budući RPC-ovi ne moraju ništa da pamte.
- `trips`: **trip.created** (INSERT) + **driver.assigned** (UPDATE kad se promeni vozač/kamion/prikolica; payload nosi prev/new).
- `trip_stops`: **route.changed** (INSERT/UPDATE/DELETE; `company_id` iz `trips`; kod CASCADE brisanja ture roditelj je već obrisan → preskače se, bez spama).
- `attachments`: **document.uploaded** (INSERT).
- Ostali eventi (`trip.status_changed`, `trip.completed`, `invoice.*`, `employment.*`, `reminder.due`) → sledeće kriške.

## 3) Prvi POTROŠAČ — živa tabla (dokaz kraj-na-kraj)
- `src/features/activity/api.ts`: `listRecentActivity()` (čita outbox, RLS scope) + `subscribeActivity()` (Realtime INSERT → cleanup).
- `src/features/activity/ActivityFeed.tsx`: sklopiva kartica „Aktivnost (uživo)" na **Turama** (owner, oba layout-a). Nov event → lista se **sama osvežava** (React Query invalidacija na Realtime insert). Nepoznat tip → sirov `event_type` (bez pada).
- Time je dokazan pun lanac: **poslovna promena → outbox (trigeri) → Realtime → UI**.

## 4) Testovi čuvari
- **test:db** — nova svita `outbox_test.sql` (u `run.sh`): (1) direktan RLS upis → `trip.created` (payload/actor/company); (2) **atomičnost** — rollback poslovne promene ⇒ event NE preživi (subtransakcija); (3) **RPC put** (SECURITY DEFINER menja vozača) → `driver.assigned` (prev/new); (4) `route.changed` insert/delete + `document.uploaded`; (5) **tenant izolacija** (A ne vidi B i obrnuto); (6) **vozač** ne vidi outbox (0 redova). → **ALL PASSED** (cela svita 12/12).
- **jest 136/136**, **typecheck ✓**, **lint 0 grešaka** (4 baseline upozorenja), **web export exit 0**.

## PODSETNIK — ručna primena migracija
- **0029 + 0030 su SAMO na DEV** (`db push --linked`). **PROD/STAGING tek uz izričito odobrenje** (ritual). Sada su **na čekanju za PROD**: 0027, 0028, 0029, 0030.
- Rollback 0030: `drop trigger` + `drop function tg_*`. Rollback 0029: `drop function outbox_prune, emit_outbox_event`; `drop table outbox_events` (aditivno, bez uticaja na postojeće podatke); po potrebi izbaci tabelu iz `supabase_realtime` publikacije.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 136/136 (20 suita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED (12 suita, uklj. outbox) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ exit 0 |
| i18n 30/30 | ✅ `activity.*` u svih 30 (sr/en autorski, ostali prevod); en fallback pun |
| Tenant izolacija (RLS) | ✅ dokazano u outbox_test |
| Append-only / bez event sourcing (ADR §7) | ✅ tabele ostaju izvor istine; outbox = tok obaveštavanja |
| Kvalitet: slojevi razdvojeni | ✅ ekran → `features/activity/api.ts`; nema Supabase u ekranu; nema duplikata logike |
| Link ostao na DEV | ✅ |
