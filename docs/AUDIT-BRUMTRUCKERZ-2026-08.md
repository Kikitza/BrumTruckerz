# Security & Code-Quality Audit — BrumTruckerz

**Date:** 2026-08-19
**Auditor:** Automated multi-agent review (Claude Opus 4.8), read-only
**Codebase:** `main` @ `459731a`
**Scope:** Full repository — Supabase schema (migrations 0001–0014), Edge Functions, Expo/React Native client, offline queue, i18n, build/CI, dependencies, docs.
**Method:** Static read-only review by five domain agents, headline findings re-verified by hand against source. No code, schema, secret, or configuration was modified. **No secret VALUES are reproduced in this document — only names and file locations.**

---

## Table of contents

1. Scope & Methodology
2. System Overview
3. Threat Model & Trust Boundaries
4. Severity Model & Findings Register
5. Tenant Isolation (RLS)
6. Role Model & Privilege Separation
7. Driver Financial Confidentiality
8. Append-Only Audit Trail (`trip_events`)
9. Platform-Admin Least Privilege (0014)
10. Company Suspension & Billing Enforcement
11. SECURITY DEFINER Functions & `search_path`
12. RPC Authorization
13. Vehicle-Limit / Plan Integrity
14. Edge Functions — Authentication & Authorization
15. Edge Functions — Secrets & Service-Role Handling
16. Scheduled Jobs (`reminders-cron`)
17. Secrets Management & Repository Hygiene
18. Client Session & Token Storage
19. Offline Queue — Reliability & Integrity
20. Offline Queue — Multi-Tenant Safety
21. Computation Integrity (FX / P&L math-in-code)
22. Input Validation & Injection Surface
23. Error Handling & Information Disclosure
24. Storage & Attachments Security
25. Internationalization Integrity
26. Theming, Reversibility & UX Safety Rules
27. Code Quality & Architecture Conformance
28. Dependencies, Supply Chain, Build & CI/CD
29. Test Coverage & Verification Gaps
30. Compliance, Data Protection (GDPR) & Positioning

*Appendix A: Prioritized Remediation Backlog*
*Appendix B: Executive Summary & Final Verdict → see `docs/AUDIT-SAZETAK.md` (bilingual)*

---

## 1. Scope & Methodology

The audit covered every tracked file relevant to security and correctness: 14 SQL migrations, 4 Edge Functions plus shared auth, the complete `app/` and `src/` client trees, offline queue, 30 locale files, and all build/CI/config. Five independent read-only agents each owned a domain (DB/RLS, Edge, client/offline, i18n/quality, build/supply-chain). Every High-severity finding below was re-verified by hand from the cited source lines. The project's own three gates were executed to establish ground-truth build health (§29). Dynamic penetration testing against a live database was **not** performed; RLS findings are derived from policy source and cross-checked against the client's data-access paths.

## 2. System Overview

BrumTruckerz is a multi-tenant Expo/React-Native (SDK 54, RN 0.81, React 19, TypeScript strict) app over Supabase (Postgres + RLS, Auth, Deno Edge Functions, Storage). Tenancy: every business row carries `company_id`; three roles — `platform_admin`, `owner`, `driver`. The product's differentiators are its security invariants: drivers never see finances (enforced in the database), the event diary is append-only, and the platform operator is deliberately walled off from customer business content. The client is offline-first: all driver mutations pass through a local SQLite queue.

## 3. Threat Model & Trust Boundaries

Principal trust boundaries and the assets they protect:

- **Tenant ↔ tenant** — company A must never read/write company B. Enforced by RLS keyed on `company_id`, plus explicit `company_id` re-checks in service-role Edge code.
- **Driver ↔ owner (intra-tenant column privacy)** — the driver is inside the tenant but must not see revenue/profit/pay. Enforced by column-less views + RPCs, not row-level RLS.
- **Customer ↔ platform operator** — a stated design goal (0014) is that the SaaS operator (`platform_admin`) cannot read customers' operational content. This is a privacy/trust boundary that matters commercially and for GDPR (data-controller separation).
- **Device ↔ server** — the client holds a long-lived refresh token and a queue of pending mutations; a shared or compromised device is in-scope.
- **Client input ↔ privileged server code** — Edge Functions run with the service-role key and must not trust client-supplied identity.

Findings §8, §9, §10 sit on boundaries 2–3; §18, §20 on boundary 4.

## 4. Severity Model & Findings Register

Severity: **Critical** (cross-tenant data breach or trivial privilege escalation), **High** (defeats a stated security invariant / meaningful confidentiality or integrity loss), **Medium** (exploitable under specific conditions, or reliability/integrity risk), **Low** (hardening / limited impact), **Info** (observation / by-design).

| # | Sev | Finding | Location | Status |
|---|-----|---------|----------|--------|
| A1 | **High** | 0014 recreates `events_owner … FOR ALL`, restoring owner UPDATE/DELETE on the append-only diary | `0014_platform_admin.sql:35-36` | Confirmed |
| A2 | **High** | `platform_admin` still SELECT/INSERT on `trip_events` — not cut from business content as 0014 intended | `0002_multicurrency_audit.sql:124,132` | Confirmed |
| A3 | **High** | Company suspension enforced only in a client redirect (fail-open on error); no RLS references `companies.status` | `app/index.tsx:26-31`, `admin/api.ts:44-48`, all migrations | Confirmed |
| A4 | **High** | Offline queue: one permanently-failing mutation blocks the whole queue forever (no max-attempts / dead-letter) | `src/lib/offline/queue.ts:84-94` | Confirmed |
| B1 | **Medium** | No source-controlled `config.toml` pinning per-function `verify_jwt` posture | `supabase/` (absent) | Needs manual check |
| B2 | **Medium** | `trip_event.insert` retry can duplicate diary rows (no idempotency key / no `23505`-as-success) | `offline/handlers.ts:22-28`, `trips/api.ts:339-344` | Confirmed |
| B3 | **Medium** | `trip_event.correct` retry can append duplicate correction versions | `offline/handlers.ts:62-75` | Needs manual check |
| B4 | **Medium** | Offline queue not user-scoped; sign-out never drains it → cross-tenant flush on a shared device | `offline/queue.ts:35-42`, `auth/signOut.ts` | Confirmed |
| B5 | **Medium** | Supabase session (incl. refresh token) stored in AsyncStorage, not SecureStore | `src/lib/supabase.ts:11-13` | Confirmed |
| B6 | **Medium** | 22 `npm audit` advisories (11 high / 11 moderate) in the Expo/Metro build toolchain | `package-lock.json` | Confirmed |
| B7 | **Medium** | Missing api return type leaks `any` into the driver screen under `strict` | `trips/api.ts:332`, `app/(driver)/index.tsx:40,144` | Confirmed |
| B8 | **Medium** | Required test suites (offline queue, RLS A≠B, correct-event chain) are absent | `src/**/*.test.ts` | Confirmed |
| C1 | Low | SECURITY DEFINER fns pin `search_path=public`; safe only if `authenticated`/`anon` lack CREATE on `public` | `0001_init.sql:228-241` et al. | Needs manual check |
| C2 | Low | `enforce_vehicle_limit` TOCTOU race — plan cap can be marginally exceeded under concurrency | `0013_company_plan_vehicle_limit.sql:28-34` | Confirmed |
| C3 | Low | `NoRole` fallback calls `supabase.auth.signOut()` inline — bypasses shared `useSignOut` + its confirm | `app/index.tsx:10,40` | Confirmed |
| C4 | Low | Icon-only attachment delete button has no `accessibilityLabel`/`Role` | `attachments/AttachmentsSection.tsx:223` | Confirmed |
| C5 | Low | Edge functions pass raw Postgres/provider error strings to the client | `_shared/auth.ts:39-42` + call sites | Confirmed |
| C6 | Low | Custom driver password accepted at length ≥ 6 (weak allowed) | `create-driver-account/index.ts:25` | Confirmed |
| C7 | Low | No real backoff keyed on `attempts`; `enqueue` immediately re-hammers a stuck head item | `offline/queue.ts:57,88` | Confirmed |
| C8 | Low | `void flush()` can raise an unhandled rejection if `getDb()`/`NetInfo.fetch()` throws | `offline/queue.ts:57,135,137` | Confirmed |
| C9 | Low | FX rate `0` / negative not guarded (`rate == null` only) → silent `base_amount = 0` | `fx/rates.ts:35` | Confirmed |
| C10 | Low | `setStatus` (driver) has no try/catch and under-invalidates queries | `app/(driver)/index.tsx:42-47` | Confirmed |
| C11 | Low | `production` EAS profile builds an internal APK, not a Play AAB | `eas.json:14,16` | Confirmed (release-readiness) |
| C12 | Low | RUNBOOK offers SQL-Editor migration apply, contradicting the CLAUDE.md ritual | `RUNBOOK.md:34` | Confirmed |
| C13 | Low | CI Node pinned to major `20` only (float across minor/patch) | `.github/workflows/ci.yml:13` | Confirmed |
| D1 | Info | Cleartext provisioned password returned in create-driver response (by design, over TLS, not logged) | `create-driver-account/index.ts:54` | By design |
| D2 | Info | Anon (public) JWT embedded literally in tracked `eas.json` (public-by-design, RLS-gated) | `eas.json:9-10,18-19` | By design |
| D3 | Info | `delete-driver-account` teardown is non-atomic (no transaction) | `delete-driver-account/index.ts` | By design |
| D4 | Info | Route-group layouts have no per-layout role guard (RLS is the real control) | `app/(owner)/_layout.tsx`, `app/(admin)/_layout.tsx` | Defense-in-depth |
| D5 | Info | `getRate` uses `fetch` with no timeout (online owner path only) | `fx/rates.ts:9` | Minor |

**Tally:** 0 Critical · 4 High · 8 Medium · 13 Low · 5 Info.

---

## 5. Tenant Isolation (RLS)

**Verified correct.** Every tenant table carries `company_id` and has RLS enabled — 13 tables in `0001_init.sql:246-258`, `push_tokens` (`0002:194`), `trip_stops` (`0010:29`). Indexes are `company_id`-led (§6 of `docs/data-model.md`). `trip_stops` derives tenancy through its parent `trips` and scopes policies via `trips.company_id` (owner) / `driver_can_access_trip` (driver) — cross-tenant safe. GRANTs target `authenticated` only; **no grants to `anon`**; storage policies are `to authenticated`. `push_tokens` is restricted to `user_id = auth.uid()` (`0002:195-196`). No cross-tenant read/write path was found in schema or client. The service-role Edge layer re-checks `company_id` on every privileged operation (§14). This is the strongest part of the system.

## 6. Role Model & Privilege Separation

Three roles resolved server-side via SECURITY DEFINER helpers `current_company_id()`, `current_role_name()`, `current_driver_id()` (`0001:228-241`). The client's `useSession` is **fail-closed**: it stays `loading` until both session and role resolve and maps any role error/unknown to `null` → `NoRole`, never defaulting to `owner` (`useSession.ts:36-58`). On user switch the React Query cache is cleared (`useSession.ts:42`) — but note this does **not** clear the SQLite queue (see A/B4, §20). Route-group layouts do not re-check role (D4); this is acceptable because RLS is the real control, but a mis-routed driver would render raw error states rather than a clean redirect.

## 7. Driver Financial Confidentiality

**Verified correct — a well-designed column-privacy scheme.** Drivers have **no** SELECT policy on base `trips`. They read the `driver_trips` view (`0001:369`), which omits `revenue`/`driver_pay`/profit and self-filters to their own trips via `current_driver_id()`. Progress happens only through `driver_update_trip_progress` (`0011:23-49`), which touches no financial columns. The financial views `trip_pnl` and `driver_performance` are `security_invoker = on` (`0001:379,410`), so RLS on the underlying `trips`/rollup yields empty results for drivers. The client honors all of this (`trips/api.ts:332-337`). The classic "`exists()` under driver-RLS returns false because the driver can't read the base table" trap is correctly solved with the SECURITY DEFINER helper `driver_can_access_trip` (`0009`), applied consistently to attachments, expenses, trip_events, storage, and trip_stops.

## 8. Append-Only Audit Trail (`trip_events`) — **A1, High**

**Confirmed regression.** Migration 0002 deliberately dropped the old `events_owner FOR ALL` policy and replaced it with SELECT-only and INSERT-only owner policies, with a code comment stating the intent: *"stare politike su dozvoljavale UPDATE/DELETE → ukidamo; ostaju SELECT + INSERT"* and *"NEMA update/delete politika ⇒ niko (osim service role) ne menja istoriju direktno"* (`0002:119-139`). This makes the diary append-only at the RLS layer, so the only way to amend an event is the versioned `correct_trip_event` RPC.

Migration 0014 then executes:

```
drop policy if exists events_owner on trip_events;
create policy events_owner on trip_events for all …   -- 0014:35-36
```

The `DROP` is a no-op (that policy ceased to exist after 0002), but the `CREATE … FOR ALL` **re-introduces owner UPDATE and DELETE**. Because Postgres OR-combines permissive policies, an owner can now directly `UPDATE`/`DELETE trip_events`, silently rewriting or erasing the audit trail and bypassing `correct_trip_event` entirely. This violates CLAUDE.md invariant #3 (events append-only) and the data-model's audit guarantee. The sibling recreations in 0014 (`trips_owner`, `expenses_owner`, `attach_owner`) are legitimately `FOR ALL` — only `trip_events` was supposed to remain split, and it was the one table the 0014 author should not have recreated as `FOR ALL`.

**Fix:** new migration — `drop policy events_owner on trip_events;` (leave the 0002 SELECT/INSERT policies as the only owner access). Add a test asserting owner UPDATE/DELETE on `trip_events` is rejected (§29).

## 9. Platform-Admin Least Privilege (0014) — **A2, High**

**Confirmed partial failure of the 0014 objective.** 0014's stated goal (its header comment) is to cut `platform_admin` from business/financial content — `trips`, `expenses`, `trip_events`, `attachments`, rollup, and the `security_invoker` P&L views. It **succeeds** for `trips`, `expenses`, `attachments`, `driver_month_rollup` (recreated owner-only) and transitively for `trip_pnl`/`driver_performance` (empty for admin because `security_invoker=on`). It **fails** for `trip_events`: the policies that actually grant admin access there are `events_select_owner` and `events_insert_owner` from 0002, which both begin:

```
current_role_name()='platform_admin' or (company_id = current_company_id() and current_role_name()='owner')
                                                    -- 0002:123-134
```

0014 never drops or rewrites these. Result: a `platform_admin` can still **SELECT every company's trip-event log** (pickup/delivery locations, free-text notes, timestamps, odometer) and **INSERT events** — exactly the operational customer content the invariant, and the customer↔operator trust boundary (§3), say must be inaccessible. This is customer PII-adjacent data and undermines the GDPR data-controller-separation posture the product markets (§30).

**Fix:** in the same corrective migration, recreate `events_select_owner`/`events_insert_owner` **without** the `platform_admin` branch. Add an RLS test asserting admin sees 0 rows of another company's `trip_events`.

## 10. Company Suspension & Billing Enforcement — **A3, High**

**Confirmed — enforcement is client-side only and fails open.** 0014 adds `companies.status ('active'|'suspended')` and `admin_set_company_status`, but **no RLS policy or trigger anywhere consults `status`** (confirmed by grep across all 14 migrations). The sole gate is `getMyCompanyStatus()` read by the app in `CompanyGate` (`app/index.tsx:26-31`), and that function returns `null` on **any** read error (`admin/api.ts:44-48`). Two consequences:

1. **Fail-open:** a transient network/read error, or a trivially modified client, yields `null` → not `"suspended"` → the user is routed straight into the app.
2. **No data-layer teeth:** a suspended tenant using a stale client, a script, or direct PostgREST calls retains full RLS read/write; any already-queued offline mutations still flush to the database.

Since suspension is a **billing** control over the tenant's *own* data (not a cross-tenant boundary), this is High, not Critical. But as-built, "suspended" changes nothing a determined tenant can't ignore.

**Fix:** enforce at RLS — add `and (select status from companies where id = current_company_id()) = 'active'` to tenant **write** policies (and, if desired, read), or at minimum make `getMyCompanyStatus` fail **closed** (treat error as suspended / block). Decide explicitly whether suspension must bite offline and at the API.

## 11. SECURITY DEFINER Functions & `search_path` — **C1, Low**

All definer functions set `search_path = public` (not empty) and reference some objects unqualified: helpers (`0001:228-241`), `refresh_driver_month`, `driver_update_trip_progress`, `correct_trip_event`, `driver_can_access_trip` (`0009:15-23`), `enforce_vehicle_limit` (`0013:16-35`), admin RPCs (`0014:50-97`). This is the Supabase-standard pattern and is safe **only while** `authenticated`/`anon` cannot CREATE objects in `public` (Supabase revokes this by default). If that grant were ever restored, a user could shadow an unqualified table/function and hijack a definer call. **Action:** confirm `CREATE ON SCHEMA public` is not granted to `authenticated`/`anon`; for defense-in-depth, migrate definer functions to `set search_path = ''` with fully-qualified references.

## 12. RPC Authorization

**Verified correct.** The admin RPCs (`admin_list_companies`, `admin_set_company_plan`, `admin_set_company_status`, `0014:50-97`) each begin with `if current_role_name() <> 'platform_admin' then raise … errcode '42501'` before touching data, and are the only path to company metadata. `correct_trip_event` (`0002:142-181`) is SECURITY DEFINER, validates caller role/ownership, appends a new version and flips `is_current=false` on the prior — correct. `driver_update_trip_progress` writes only non-financial columns. No RPC mutates without a role/`company_id` check.

## 13. Vehicle-Limit / Plan Integrity — **C2, Low**

`enforce_vehicle_limit` (`0013:28-34`) counts existing vehicles then permits the insert with no lock/serialization — a TOCTOU race lets two concurrent inserts both pass `count < limit` and exceed the paid cap. Not a tenant-isolation or data-exposure issue; it only allows marginally overshooting the plan limit. **Fix (optional):** `select … for update` on the company row, or a deferred constraint / advisory lock, if strict billing enforcement is required.

## 14. Edge Functions — Authentication & Authorization

**Verified correct — strong.** `requireOwner()` (`_shared/auth.ts:14-33`) derives identity from the JWT via an anon-key `getUser()` (never trusting client-supplied id/role/company_id), then re-reads `role` + `company_id` server-side from `app_users` with the service-role client, rejecting non-owners and owners without a company (403). All three driver-account functions call it first. `loadOwnDriver()` (`auth.ts:45-52`) loads the driver with the RLS-bypassing service-role client but then explicitly asserts `driver.company_id === ctx.companyId`, throwing 403 on mismatch — this closes cross-tenant abuse (owner A cannot act on company B's driver) even though RLS is bypassed. `get-driver-email` returns an email only after this check, so an owner can only enumerate emails of drivers already in their own fleet; `auth.users` is never exposed to the client.

## 15. Edge Functions — Secrets & Service-Role Handling

**Verified correct.** The service-role key is read only via `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` inside the Edge runtime (`auth.ts:16`, `reminders-cron:46`), never returned to the client or logged. Password generation uses `crypto.getRandomValues` (CSPRNG) over a 56-char alphabet (`create-driver-account:7-12`); modulo bias is negligible. No SQL string concatenation anywhere — all parameters flow through the Supabase client's bound `.eq()` calls, so there is **no SQL-injection surface**. **C5 (Low):** several paths forward raw upstream error text to the caller (`auth.ts:39-42`, create:43/51, delete:20-32, get-email:14, cron:64/126), leaking schema/constraint names to an authenticated owner — no secrets exposed; return generic messages and log specifics server-side. **C6 (Low):** a client-supplied custom password of length ≥ 6 is accepted verbatim (`create:25`); raise the minimum or always auto-generate. **D1/D3 (Info):** the provisioned cleartext password is returned to the authenticated owner over TLS (not logged) by design; `delete-driver-account` teardown is non-atomic (idempotent-ish, re-runnable, no cross-tenant effect).

## 16. Scheduled Jobs (`reminders-cron`)

**Verified correct.** `CRON_SECRET` is read from env (`reminders-cron:18`), never hardcoded, and the guard `if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) → 401` (`:40`) is **fail-closed**: a missing/empty secret blocks all execution (no bypass path). Comparison is plain `!==` (acceptable — timing side-channels against a high-entropy server secret over network jitter are not practical). Push composition scopes tokens per company (`ownersByCompany.get(x.r.company_id)`), so no cross-company message mixing. The function is deployed `--no-verify-jwt` (correct for a cron endpoint that self-authenticates via the header) — see B1 for the source-control gap around that posture.

## 17. Secrets Management & Repository Hygiene

**Clean.** `.env` is gitignored (`.gitignore:4`) and **not tracked** (only `.env.example` with placeholders). A scan of all tracked files found **no non-public secret** hardcoded anywhere: `service_role`/`CRON_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` appear only as `Deno.env.get(...)` reads or as doc prose forbidding secrets in the repo. Git history shows no `.env`/`.pem`/`.key`/credential file was ever committed. **D2 (Info):** `eas.json` embeds the `EXPO_PUBLIC_SUPABASE_ANON_KEY` (an `anon`-role JWT) and URL literally per profile; this is public-by-design (shipped in every client build, RLS-gated, `EXPO_PUBLIC_` prefix confirms intent) and is not a confidentiality issue. No secret VALUES were read or reproduced during this audit.

## 18. Client Session & Token Storage — **B5, Medium**

`src/lib/supabase.ts:11-13` configures `storage: AsyncStorage`, keeping the access token and the long-lived **refresh** token in unencrypted app storage; `expo-secure-store` is not used anywhere. On a rooted/jailbroken device, or via an unencrypted device backup, the refresh token is extractable and replayable. **Fix:** provide a SecureStore-backed storage adapter to `createClient` (Keychain/Keystore-backed). Positive: the sign-in screen stores only the last email, never the password (`sign-in.tsx:38`), delegating credential storage to the system password manager.

## 19. Offline Queue — Reliability & Integrity — **A4 (High), B2/B3 (Medium)**

**A4 — poison-message head-of-line blocking (High, confirmed).** In `flush()` (`queue.ts:84-94`), any handler error increments `attempts`, records `last_error`, and `return`s — halting the entire queue. `attempts` is never read to skip or dead-letter a row. A single permanently-failing mutation (e.g. a server rejection that is not `23505` — a check/FK violation, or an RLS-rejected payload) blocks **every** later mutation forever; the driver's subsequent events, expenses, and photos never sync while the UI shows them "pending". **Fix:** on `attempts >= N`, move the row to a `dead_letter` table (or flag + skip) and continue; surface dead-lettered items to the user.

**B2 — `trip_event.insert` duplicate-on-retry (Medium, confirmed).** Unlike `trip_event.km`/`expense.insert`/`attachment.upload` (which set a client UUID and treat `23505` as success), the status-event insert sets no client `id` and does not dedupe (`handlers.ts:22-28`, `trips/api.ts:339-344`). At-least-once delivery + a network drop after the server commits ⇒ the next flush re-inserts an identical event. Append-only tolerates it but pollutes the diary with duplicate load/unload/border events. **Fix:** client-generate the event `id` and treat `23505` as success, matching the other handlers.

**B3 — `trip_event.correct` duplicate-on-retry (Medium, needs manual check).** `correct_trip_event` is called with no idempotency key (`handlers.ts:62-75`); a server-commit-then-client-timeout appends a second correction version, corrupting the version chain the product relies on. **Verify** whether the RPC dedupes; if not, pass a client correction id.

**C7/C8 (Low).** No real backoff keyed on `attempts`, and `enqueue` immediately calls `void flush()` (`queue.ts:57`), re-hammering a stuck head item; a throw from `getDb()`/`NetInfo.fetch()` outside the inner try produces an unhandled rejection.

**Confirmed-correct controls:** all driver mutations route through the queue (no direct write bypasses it); the queue persists in `expo-sqlite` and images in `documentDirectory` (survive restart); FIFO ordering with a single-flight `flushing` guard preserves event-before-correction / expense-before-photo; km/expense/attachment are idempotent via client UUID + `23505`-as-success + storage `upsert:true`.

## 20. Offline Queue — Multi-Tenant Safety — **B4, Medium**

**Confirmed.** The `mutations` table has no user/company column (`queue.ts:35-42`), and `signOut` never drains or clears it. Scenario on a shared device: owner/user A enqueues work and signs out; user B signs in; the interval/net-triggered `flush` runs under B's session. `attachment.upload` resolves `company_id` from the **current** user (`handlers.ts:134`) and could write A's photo into B's company storage; `expense.insert`/`trip_event.*` carry A's `company_id` in-payload and get RLS-rejected under B, becoming permanent poison messages (compounding A4). **Fix:** stamp each queued row with the enqueuing `user_id`/`company_id` and only flush rows matching the active session; on sign-out, either block sign-out while the queue is non-empty or scope/clear it deliberately.

## 21. Computation Integrity (FX / P&L math-in-code) — **C9, Low**

**Verified correct (core).** `computeBase` computes `base_amount = round2(original × rate)` in **code**, shared by the owner-online path (`expenses/api.ts:143`) and the offline handler (`handlers.ts:102`) — never delegated to a model, satisfying CLAUDE.md invariant #5. Rate precedence: manual override → 1 (same currency) → `getRate` for the *expense date*; a missing rate throws so the mutation stays queued and is surfaced (`fx/rates.ts:28-37`). P&L views aggregate `base_amount` in the company base currency. **C9 (Low):** the guard is `rate == null`, so `0` (a bad API response, or a manual override of `0`, which `fxOverride ?? …` treats as valid) yields a silent `base_amount = 0`; add `rate > 0` validation. **D5 (Info):** `getRate` uses `fetch` with no timeout (online path only).

## 22. Input Validation & Injection Surface

**No injection surface found.** Edge inputs use bound `.eq()` parameters (no string-built SQL); email is normalized and minimally validated; malformed JSON bodies degrade to handled validation errors (`.catch(() => ({}))`). Storage keys follow the `company_id/trip_id/uuid.jpg` convention and are not built from unsanitized free text. Email format checking is loose (any string with `@`) but Supabase Auth performs its own validation and returns a handled error.

## 23. Error Handling & Information Disclosure

Client error handling is mostly sound: user-facing errors go through `Alert.alert(t("common.error"), …)`, and empty catches are intentional best-effort cleanup (local-file deletion, last-email persistence) that never swallow a data-integrity error. Gaps: **C10 (Low)** `setStatus` (driver) has no try/catch and invalidates only `pending-count`, not `driver-trips`/`driver-events`, so the status button lags until the next poll; **C5 (Low)** Edge functions leak raw Postgres/provider error text (§15). No secret values are surfaced in any error path.

## 24. Storage & Attachments Security

**Sound.** The private `prilozi` bucket is governed by storage policies (0008) in the spirit of `attach_owner`/`attach_driver`; the DB stores only the object key (`attachments.storage_key`), file access is via signed URLs, on-device compression precedes upload, and uploads use `upsert:true` to avoid orphaned rows on retry. Driver access to attachments is gated by `driver_can_access_trip` (§7). **C4 (Low):** the icon-only "×" delete control lacks an `accessibilityLabel`/`Role` (`AttachmentsSection.tsx:223`). Note: the `attach_owner` policy on the underlying `attachments` **table** is a legitimate `FOR ALL` (unlike `trip_events`, §8), so its 0014 recreation is correct.

## 25. Internationalization Integrity

**Verified correct.** All 30 locale files have full key parity with `en` (220 real keys each): zero keys exist in another locale but missing from `en`, and zero `en` keys are missing from any locale (validated by a flatten+diff script). `en` remains the fallback. `sr` and `en` carry no `_status`; all 28 machine locales retain `"_status":"machine"` (untouched, per the CLAUDE.md language rule). `sr`'s `_few` plural extras are expected and correctly excluded. No hardcoded user-facing strings — everything routes through `t()`. Number/date/currency formatting is centralized in `src/lib/format.ts` with no stray `toLocaleString`/`toFixed`/`Intl` in components. (Info: machine locales carry a `_note`/`_status` metadata key not in `en`; these are never referenced via `t()` and are harmless.)

## 26. Theming, Reversibility & UX Safety Rules

**Verified correct.** `src/lib/theme.ts` defines both light and dark palettes; a grep for `#rrggbb` literals across `app/`/`src/` found none outside `theme.ts`. Reversibility holds: `NewTripModal` is a 4-step wizard with all state held in the parent and a lossless `back()`; fleet uses one create+edit modal (pre-filled `editing` flag); `TripDetailModal` supports editable route/assignment with cancel and is locked on archived trips; every destructive action (fleet + driver-account, expense, attachment, trip stop, admin status change, sign-out) is confirmed via `Alert.alert(..., { style: "destructive" })`. The one exception is the `NoRole` inline sign-out (C3), which lacks the confirm the shared hook provides.

## 27. Code Quality & Architecture Conformance

Layering is respected: no screen calls Supabase for **business** data — reads/writes go through feature `api.ts`. Exceptions are auth-only (`sign-in.tsx` calls `signInWithPassword` directly — defensible; there is no `features/auth/api.ts`) and the `NoRole` inline `signOut` (C3, should reuse `useSignOut`). **B7 (Medium):** `driverListTrips()` returns untyped `.select("*")` data (`trips/api.ts:332`), forcing `x: any`/`active: any` in the driver screen (`app/(driver)/index.tsx:40,144`) and defeating `strict`; declare a `DriverTrip` type. Minor `any` in the generic queue types (`queue.ts:23,108`). No dead or commented-out code. Largest files — `app/(owner)/fleet.tsx` (566 lines) and `TripDetailModal.tsx` (466) — exceed the ~400-line guideline but are cohesive; extracting the fleet create/edit form is an optional refactor, not a defect.

## 28. Dependencies, Supply Chain, Build & CI/CD — **B6 (Medium), C11–C13 (Low)**

**B6 (Medium):** `npm audit --omit=dev` reports 22 advisories (11 high, 11 moderate, 0 critical), all in the Expo/Metro **build toolchain** transitive tree (roots: `image-size` ICNS DoS, `postcss` CSS-stringify XSS via `metro`/`@expo/*`; `uuid` bounds via `xcode`). These are prebuild/dev tooling that does not ship in the client bundle, so real runtime exposure is low; resolution tracks upstream Expo SDK 54 patches — bump when available. **Positives:** Expo `^54.0.36` / RN `0.81.5` / React `19.1.0` and all `expo-*` are SDK-54-aligned and internally consistent; no `postinstall`/`preinstall` scripts in `package.json`; `package-lock.json` (v3) + `npm ci` give reproducible installs; `tsconfig` `strict: true`; `.env` untracked; DEV (`preview`) and PROD (`production`) Supabase backends are cleanly separated by profile in `eas.json`. **CI** runs `npm ci → typecheck → lint → test` (the full CLAUDE.md ritual), needs no secrets (`jest.setup.js` injects dummy `EXPO_PUBLIC_*`), and leaks no env to logs. **C11:** the `production` profile builds an internal-distribution **APK** — must become an **AAB** before Play submission. **C12:** `RUNBOOK.md:34` offers a SQL-Editor migration-apply path that contradicts the CLAUDE.md "SQL Editor is no longer used for migrations" rule and risks schema drift — align it. **C13:** CI Node is pinned to major `20` only.

## 29. Test Coverage & Verification Gaps — **B8, Medium**

Ground-truth build health (executed this audit): **typecheck 0 errors**, **lint 0 errors / 5 warnings** (2 array-type style, 2 `exhaustive-deps`, 1 i18n named-export), **tests 58/58 passing across 9 suites**. However, the passing suites are **pure-function units only** (fx, stops, events, notification-stage, num, base64, adminMath, uuid, plan). CLAUDE.md's Konvencije explicitly require tests for: **the offline queue (enqueue/flush/retry)**, **RLS (company A ≠ company B)**, and **the `correct_trip_event` version chain** — **none of these exist**. This is the most consequential process gap: the two highest-severity confirmed findings (A1 append-only regression, A4 poison-message blocking) live precisely in the untested offline-queue and RLS surfaces, and a regression test would have caught A1 at author time. **Fix:** add (a) an RLS test proving owner UPDATE/DELETE on `trip_events` is rejected and admin reads 0 rows of another company; (b) a queue test for retry / poison-message / user-scoping; (c) a `correct_trip_event` chain test.

## 30. Compliance, Data Protection (GDPR) & Positioning

The product markets itself as a *"digital archive of transport documentation"* and deliberately avoids the term **eCMR** (legally protected; eFTI certification is a later phase) — this positioning is consistently respected in code and docs and should remain. The PRD (§7.3) treats **GDPR as mandatory** across the EU: privacy policy, consents, right to erasure/export, and App Store / Play data-safety labels. Audit implications:

- **Operator↔customer data separation (§9, A2)** directly supports the GDPR data-controller story: leaving `platform_admin` able to read every tenant's `trip_events` weakens the "the operator cannot see your operational data" claim. Closing A2 is both a security fix and a compliance/marketing-integrity fix.
- **Right to erasure:** `delete-driver-account` keeps operational history by design (documented) and nulls audit pointers; a full data-subject-erasure flow (across `attachments` storage objects, `trip_events`, `expenses`) is not yet built — plan it for the compliance phase.
- **Data minimization / retention:** document images (CMR/customs) are retained for years for accounting; a retention policy + cold tier is noted in the data-model but not yet implemented.
- **Token-at-rest (§18, B5):** unencrypted refresh tokens on device are a reasonable item to resolve before wide EU distribution.
- **Billing (Phase 3):** RevenueCat per-vehicle subscription; the entitlement gate is designed but suspension is not yet enforced server-side (§10, A3) — align before monetization.

No content in this report reproduces any secret value; only names and locations were used, per the delivery rules.

---

## Appendix A — Prioritized Remediation Backlog

**P0 — before any further production migration or wider release (all confirmed):**
1. **A1** — corrective migration dropping `events_owner FOR ALL` on `trip_events` (restore append-only). *(1 migration + 1 RLS test)*
2. **A2** — recreate `events_select_owner`/`events_insert_owner` without the `platform_admin` branch (cut admin from event content). *(same migration + 1 RLS test)*
3. **A3** — enforce company suspension in RLS (or fail `getMyCompanyStatus` closed). *(policy change / client fix)*
4. **A4** — offline queue max-attempts + dead-letter so one bad op can't freeze the queue. *(client)*

**P1 — reliability, tenancy & hardening:**
5. **B4** — user-scope the offline queue + handle sign-out with a non-empty queue.
6. **B2/B3** — client idempotency keys for `trip_event.insert` and `.correct`.
7. **B5** — SecureStore-backed session storage.
8. **B8** — add the three required test suites (RLS, queue, correct-event chain).
9. **B1** — commit `config.toml` pinning per-function `verify_jwt`.
10. **B7** — `DriverTrip` return type (remove `any` in the driver screen).

**P2 — quality, release-readiness, compliance:**
11. **B6** — track/bump Expo toolchain advisories.
12. **C2, C5, C6, C7–C10, C11–C13** — TOCTOU lock, generic Edge errors, stronger passwords, backoff, FX `>0` guard, `setStatus` try/catch, AAB profile, RUNBOOK alignment, exact Node pin.
13. **C1** — verify no `CREATE ON public` for `authenticated`/`anon`; optionally move definer fns to `search_path=''`.
14. **§30** — plan a full data-subject-erasure flow and an image-retention policy for the compliance phase.

## Appendix B — Executive Summary & Final Verdict

See `docs/AUDIT-SAZETAK.md` (bilingual EN + SR), which also carries §28, §29, and §30 in both languages.
