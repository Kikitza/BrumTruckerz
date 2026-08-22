# IZVEŠTAJ — v2-2 kriška 2: PUNA POKRIVENOST EVENATA + audit_log (trajna knjiga)

> Nastavak event/outbox sloja (ADR 0012). Svi domenski eventi + **trajna nepromenjiva knjiga** `audit_log`. **Sve na DEV.**

## 1) Migracija 0031 — puna pokrivenost emisija (na DEV)
Dopuna trigera (isti obrazac 0030 — pokriva RLS **i** RPC put):
- **trips:** + `trip.status_changed` (payload prev/new) + `trip.completed` (prelaz u `finished`).
- **invoices:** `invoice.issued` (INSERT — pokriva `issue_invoice` RPC put), `invoice.paid`, `invoice.cancelled` (UPDATE prelaz statusa).
- **employments:** `employment.started` (INSERT active), `employment.ended` (`ended_at` postavljen / status→ended).
- **customers:** `customer.created` (INSERT).
- **`reminder.due`:** RAČUNATI event (ADR §3) — nema originalnog upisa reda, pa ga **`reminders-cron` emituje eksplicitno** kroz `emit_outbox_event` (grant za `service_role`). Cron dopunjen + **redeploy na DEV** (best-effort: greška emisije ne ruši cron).

## 2) Migracija 0032 — `audit_log` (trajna sestrinska knjiga, §11)
- Kolone: `id, occurred_at, company_id, actor_user_id, action (=event_type), aggregate_type, aggregate_id, summary jsonb`.
- **Pune je ISTI put:** `emit_outbox_event` sada upisuje u **obe** tabele (outbox + audit) u jednom pozivu → jedan izvor istine „desilo se"; svi trigeri i cron automatski pišu i audit, **bez dodatnog koda**.
- **RLS:** office čita SVOJU firmu; `platform_admin` **NE** (poslovni sadržaj, duh audita A2); direktan upis nemoguć (samo definer put); **BEZ update/delete politika → knjiga je nepromenjiva**; indeks `(company_id, occurred_at desc)`.
- **Retencije NEMA** (za razliku od outbox-a koji se čisti posle 30 dana) — trajni zapis.

## 3) ActivityFeed — novi tipovi
- `LABEL_KEY` proširen na svih 13 tipova (status_changed, completed, invoice.*, employment.*, customer.created, reminder.due); **nepoznat tip i dalje sirov, bez pada**.
- i18n: `activity.event.*` 9 novih ključeva u **svih 30** (sr/en autorski, ostali prevod); paritet 13/13 potvrđen; en fallback pun.

## 4) Testovi čuvari (`outbox_test.sql` prošireni)
- `trip.status_changed` (prev=draft/new=loading) + `trip.completed`; `invoice.issued` (fixture INSERT = RPC put) + `invoice.paid`; `customer.created`; `employment.started` + `employment.ended`.
- **audit paritet:** `audit_log` dobija red uz svaki event (trip.created, document.uploaded provereni).
- **audit RLS:** office svoja firma (A vidi svoje, ne vidi B; B ne vidi A); **vozač 0**; **platform_admin 0** (audit i outbox); firma A≠B.
- **audit nepromenjiv:** UPDATE i DELETE ne diraju nijedan red (0 rows — nema politike).
- → `npm run test:db` **ALL PASSED** (12 suita).

## PODSETNIK — ručna primena migracija
- **0031 + 0032 su SAMO na DEV** (`db push --linked`). **reminders-cron** redeploy-ovan na **DEV**. PROD/STAGING tek uz izričito odobrenje.
- Na čekanju za PROD sada: **0027, 0028, 0029, 0030, 0031, 0032** (+ cron redeploy + `emit_outbox_event` grant za service_role).
- Rollback 0032: `drop function` (vratiti 0029 verziju emit-a) + `drop table audit_log`. Rollback 0031: `drop trigger invoices/employments/customers_outbox` + vratiti 0030 verziju `tg_trips_outbox` + `revoke ... from service_role`.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 136/136 (20 suita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED (12 suita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ exit 0 |
| i18n 30/30 | ✅ `activity.event.*` 13/13 u svih 30; en fallback pun |
| Jedan izvor „desilo se" | ✅ emit puni outbox + audit; trigeri/cron bez duplikata |
| audit nepromenjiv / bez retencije | ✅ dokazano u testu (update/delete=0) |
| Tenant izolacija (outbox + audit) | ✅ A≠B; admin/vozač 0 |
| Link ostao na DEV | ✅ |
