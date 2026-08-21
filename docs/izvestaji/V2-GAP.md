# v2.0 GAP MAPA — rekoncilovano naspram PDF-a

> **Izvor zahteva:** `docs/ETNOP_Senior_Projektni_Zadatak_v2.0 (1).pdf` (v2.0, 21.8.2026, 28 sekcija) — pročitan u
> celosti; zahtev-strana dolazi **isključivo** iz PDF-a. **Stvarnost-strana** iz koda/šeme (migracije 0001–0026,
> `src/features/`, Edge funkcije, `app.config`, ADR). **Bez mišljenja/preporuka — samo činjenice.**
> Oznake: **✓ IMAMO** · **~ DELIMIČNO** (uz „fali:") · **✗ NEMA**. Gde se PDF razlikuje od prethodne (pretpostavljene)
> mape: **[NOVO iz PDF-a]** ili **[ISPRAVKA]**.

## SKOR po oblasti (pregled)
| # | Oblast (PDF §) | ✓ | ~ | ✗ |
|---|---|---|---|---|
| 1 | Identitet/kompanije/role/dozvole (§4) | 4 | 1 | 4 |
| 2 | Onboarding & SMS OTP (§5) | 2 | 2 | 1 |
| 3 | Driver Network / geo mapiranje (§6, Faza 6) | 0 | 0 | 4 |
| 4 | Ture & Dispatch (§7.1, §8) | 5 | 2 | 1 |
| 5 | Troškovi (§7.2) | 2 | 0 | 0 |
| 6 | Dokumenti (§7.3) | 3 | 1 | 1 |
| 7 | P&L ture (§7.4) | 2 | 1 | 0 |
| 8 | Fleet (§7.5) | 3 | 1 | 2 |
| 9 | Driver compliance (§7.6) | 1 | 1 | 1 |
| 10 | Rokovi / reminders (§7.7) | 3 | 1 | 0 |
| 11 | Driver performance (§7.8) | 2 | 0 | 0 |
| 12 | Driver resources (§7.9) | 3 | 1 | 0 |
| 13 | Export (§7.10) | 1 | 0 | 1 |
| 14 | Notifikacije (§7.11) | 2 | 1 | 1 |
| 15 | Search & audit (§7.12) | 0 | 1 | 1 |
| 16 | Event/outbox & realtime (§8, §10) | 0 | 1 | 2 |
| 17 | Navigation / telematika (§9) | 0 | 0 | 3 |
| 18 | Tehn. arhitektura & data model (§10) | 2 | 2 | 3 |
| 19 | Bezbednost/privatnost/compliance (§11) | 4 | 1 | 1 |
| 20 | Offline & sync (§12) | 4 | 1 | 0 |
| 21 | Skala & performanse (§13) | 2 | 1 | 1 |
| 22 | i18n & lokalizacija (§14) | 3 | 1 | 1 |
| 23 | Marketing / growth agent (§15) | 0 | 0 | 1 |
| 24 | Monetizacija & entitlement (§16) | 1 | 0 | 2 |
| 25 | API & integracije (§17) | 1 | 2 | 1 |
| 26 | Engineering / CI/CD / okruženja (§18) | 3 | 2 | 1 |
| 27 | Test strategija (§19) | 2 | 2 | 3 |
| 28 | Observability (§10/§18) | 0 | 0 | 2 |
| | **UKUPNO** | **61** | **33** | **43** |

---

## 1) Identitet, kompanije, role i dozvole (§4)
| Zahtev iz PDF-a | Stanje | Referenca / „fali" |
|---|---|---|
| Multi-tenant, company-scoped (svaka poslovna tabela `company_id`) | ✓ | RLS + `company_id` na svim tabelama, `0001_init.sql`+; helperi `current_company_id()/current_role_name()` `0001:228-241` |
| DB/API enforce (UI guard nije kontrola) | ✓ | RLS politike (owner-obrazac na ~8 tabela); audit potvrđuje „izolacija jaka" (`AUDIT-SAZETAK.md`) |
| role: `platform_admin` | ✓ | enum `0001:15`; `0014_platform_admin` |
| role: `company_owner` | ✓ | `owner` u enum `0001:15` |
| role: `dispatcher` | ✓ | `0020_dispatcher_office_role` (enum ADD VALUE + `is_office_role()`) |
| role: `driver` | ✓ | enum `0001:15`; `driver_trips` view + RPC |
| role: **`fleet_manager`** | ✗ **[ISPRAVKA]** | enum nema; prošla mapa ga je predvidela — PDF potvrđuje ime `fleet_manager` |
| role: **`finance_manager`** | ✗ **[ISPRAVKA]** | prošla mapa je pisala „finance"; PDF: **`finance_manager`** |
| role: **`support_readonly`** | ✗ **[ISPRAVKA]** | prošla mapa „support"; PDF: **`support_readonly`** (bez write po defaultu) |
| Korisnik član **više kompanija** | ~ | substrat `employments` (osoba↔firma, od–do, `role_on_company`) `0017:64`; ALI `app_users` nosi **jednu** `company_id`+`role` `0001:36-44` → nema aktivne-firme prebacivanja |
| **Više rola u istoj kompaniji + union dozvola** (Owner+Dispatcher = jedan nalog, union) | ✗ | `app_users.role` je jedna vrednost; RLS po jednoj tekućoj roli — nema union modela |

## 2) Onboarding & SMS registracija vozača (§5)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Phone-first OTP (E.164, potvrda broja) | ~ | `phone.ts` (`normalizePhone`→E.164, `isValidPhone`), `PhoneOtpSteps.tsx`, Supabase OTP; ALI **iza flaga** `EXPO_PUBLIC_PHONE_LOGIN` (prod `0`) — nije primarni tok |
| „Registruj se" tok (ime/prezime/telefon → OTP → aktivan profil) | ~ | `EmailSignUp.tsx` (email primaran); telefon-registracija skica iza flaga; **fali:** phone-first registracija kao primarni |
| Bootstrap/pozivnica firme (odvojen od identiteta) | ✓ | `0018_invitations`, `accept_invitation`; ADR 0002 (članstvo≠identitet) |
| OTP rate-limit / anti-abuse / device-session tracking / recovery | ✗ **[NOVO iz PDF-a]** | eksplicitni anti-abuse/rate-limit/recovery flow — nema u kodu |
| Minimalni driver profil (preferred_language, država, kategorije dozvole, **Code 95** status/expiry, ADR, dostupnost) | ✗ **[NOVO iz PDF-a]** | `driver_profiles` `0017:41` je minimalan (javni broj/identitet); nema ovih polja |

## 3) Driver Network, oglasi i geografsko mapiranje (§6; Faza 6)
| Zahtev | Stanje | Referenca |
|---|---|---|
| `countries_of_interest`, `route_preferences` | ✗ **[NOVO iz PDF-a]** | ne postoje |
| `work_pattern`, `vehicle_experience`, `licenses/certificates`, availability windows, relocation | ✗ | ne postoje |
| Marketplace/network (job_posts, matching, applications, verifikacija) | ✗ | ne postoji |
| **Data collision guard** (zemlja interesa ≠ oglasa ≠ firme ≠ prebivališta ≠ lokacije — odvojena polja) | ✗ **[NOVO iz PDF-a]** | nema strukture; izričit zahtev PDF-a |

## 4) Ture & Dispatch (§7.1, §8)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Kreiranje ture + status/dnevnik + početna/završna km | ✓ | `trips`+`trip_status` `0001:16,86`; `trip_events` append-only; km `0011_trip_event_km` |
| Dodela driver+vehicle+trailer, zaključavanje istorijske kombinacije | ✓ | kolone na `trips`; `ownerUpdateTripAssignment`; završene ture zaključane (ADR 0006) |
| pickup/delivery stopovi | ✓ | `0010_trip_stops`; `stops.tsx` |
| Owner unosi prihod + driver compensation | ✓ | `ownerUpdateTripFinance` (`revenue`, `driver_pay_mode/pay`) |
| Vozač bez finansija (view+RPC) | ✓ | `driver_trips` + `driver_update_trip_progress` `0001/0009` |
| **`trip_assignments` kao zaseban (verzionisan) entitet** | ~ **[NOVO iz PDF-a]** | dodela su **kolone** na `trips`, ne zasebna tabela (data model §10.2 traži `trip_assignments`) |
| **ETA** na turi | ~ | nema ETA polja; postoji ruta/km, ne procena dolaska |
| **Formalni dispatch cockpit / real-time dodela** | ✗ | dispečer deli owner sekciju; nema dispatch tokova/incidenata (Faza 5) |

## 5) Troškovi (§7.2)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Kategorije (gorivo litri+iznos, putarina, carina, špedicija, parking, ostalo) + receipt + valuta/original | ✓ | `expenses`+`expense_category` `0001:18,129`; multivaluta `0002`; prilozi `attachments` |
| Bazni prikaz u EUR (fx kod) | ✓ | `base_amount=round(original*rate,2)`; `trip_pnl` bazna valuta; `src/features/fx/` |
| *(AdBlue/pranje/servis kao zasebne kategorije)* | ~→✓ | enum je generički (`other`) — pokriveno kroz `other`; nema poimenično, ali funkcionalno pokriveno |

## 6) Dokumenti (§7.3)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Prilozi (CMR/carina/fakture/POD/vehicle-driver docs), privatni bucket, signed URL, kompresija na uređaju | ✓ | `attachments` `0001:146`+`0008_storage_prilozi`; native `image.ts`, web `webFile.ts` |
| Metadata + audit dokumenata | ~ | `attachments` ima `kind`/veze; **fali:** audit trail brisanja/zamene dokumenta (§11) |
| Document **lifecycle** (local_pending→uploading→uploaded→verified/failed) | ~ | offline red ima pending→synced; **fali:** `verified/failed` (accepted/rejected) stanja |
| Virus/type/size validacija (document.uploaded consumer) | ✗ **[NOVO iz PDF-a]** | samo web size/type gard; nema server virus/type validacije |
| Zaseban „Documents" modul (arhiva van ture/troška) | ✗ | prilozi vezani za `trip_id`/`expense_id` |

## 7) P&L ture (§7.4)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| revenue − expenses − driver_pay; profit/km; cost/km; fuel L/100km | ✓ | view `trip_pnl` `security_invoker` `0002:77`; km/potrošnja iz tura+`norm_consumption` |
| Deterministična, auditabilna formula (kod, ne AI) | ✓ | računa se u bazi/kodu (CLAUDE.md #5) |
| **plan vs actual** (planned route/cost model) | ~ | nema planned route/cost — „kada se uvede"; trenutno samo actual |

## 8) Fleet (§7.5)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Vozila/prikolice (registracija, `current_odometer`) | ✓ | `vehicles`/`trailers` `0001:49-68` (`current_odometer` `:55`) |
| Servisi/registracije/osiguranje/tehnički/tahograf/PP/gume kao **rokovi** | ✓ | `reminders` + tipovi `0024_reminder_types_km`; datum+km |
| CRUD UI (desktop-pass) | ✓ | `app/(owner)/fleet.tsx` |
| **`maintenance_items`** (servisi kao entitet, ne samo rok) | ✗ **[NOVO iz PDF-a]** | data model §10.2 traži `maintenance_items`; postoje samo reminders |
| **`vehicle_documents`** (dokumenti vezani za vozilo) | ✗ **[NOVO iz PDF-a]** | prilozi su po turi/trošku, ne po vozilu |
| Vehicle **lifecycle status** | ~ | `current_odometer` da; **fali:** lifecycle/status kolona na `vehicles` |

## 9) Driver compliance (§7.6)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Lekarski rok | ✓ | `0003_trip_route_medical` (medical); kroz reminders |
| Code 95 / kartica tahografa / ADR / licence / ugovorni rokovi | ~ | mogu kao custom/tipizovani rokovi (`0024`); **fali:** strukturisana polja (Code 95 expiry, ADR flag) na profilu |
| Custom dokumenti vozača | ✗ | nema `driver_documents` entiteta (prilozi nisu vezani za vozača) |

## 10) Rokovi / reminders (§7.7)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Datumski + kilometražni; predefinisani + custom | ✓ | `reminders` `0001:160`; km režim `0011`; tipovi `0024` |
| Prag/eskalacija (notified_stage) | ✓ | `0012_reminder_notified_stage`; `reminders-cron` |
| default 30 dana pre isteka | ~ | prag postoji; **fali:** potvrda da je default baš 30d + eskalacija po policy-ju |
| push/email po policy-ju | ~→✓ push | push ✓ (`reminders-cron`); **fali:** email kanal |

## 11) Driver performance (§7.8)
| Zahtev | Stanje | Referenca |
|---|---|---|
| km/ture/L100/profit-km/fuel variance | ✓ | `driver_month_rollup` `0001:211`; view `driver_performance`; `refresh_driver_month` |
| Owner pune metrike, vozač svoj rezultat bez tuđih poverljivih | ✓ | privatnost kroz view+RPC (ADR/ audit) |

## 12) Driver resources (§7.9)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Truck bans/restrictions (offline) | ✓ | `restrictions` `0001:185` (12 u krug, EU izvor); `app/(driver)/resources.tsx` |
| Emergency contacts / servis-vulkanizer / country info | ✓ | `resources` `0001:197` (`tire_service/police/emergency/country_info`) |
| Zabrane dostupne offline | ✓ | offline keš zabrana (CLAUDE.md #11; resources ekran) |
| **Checklist pre polaska** | ✗→~ | nema strukturisanog checklist entiteta; **fali:** checklist |

## 13) Export (§7.10)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| PDF ture/fakture | ✓ | `src/features/invoices/pdf.ts` (HTML→print/pdf) |
| **Excel + async** export meseca/perioda (računovodstvo) | ✗ **[NOVO iz PDF-a]** | nema `exceljs`/export Edge funkcije; nema async job-a |

## 14) Notifikacije (§7.11)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Push infrastruktura (tokeni + cron) | ✓ | `push_tokens` (`0002/0012`); `reminders-cron`; FCM (F4) |
| Deadline/reminder notifikacija | ✓ | `reminders-cron` prag |
| Tipovi: assignment/route-change/missing-doc/status-exception/doc-accepted-rejected | ~ | samo deadline push; **fali:** ostali tipovi |
| **`notifications` tabela** (in-app feed) | ✗ **[NOVO iz PDF-a]** | ne postoji; data model §10.2 traži |

## 15) Search & audit (§7.12)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Global search (trip/driver/vehicle/document) | ✗ **[NOVO iz PDF-a]** | nema global search-a |
| Audit trail za finansijske/osetljive promene | ~ | `trip_events` append-only (operativni dnevnik) + `correct_trip_event`; **fali:** `audit_log` za role/reassignment/financial/doc-delete/billing (§11) |

## 16) Event/outbox & realtime (§8, §10 async)
| Zahtev | Stanje | Referenca |
|---|---|---|
| **`outbox_events`** + domain eventi (trip.created, driver.assigned, route.changed, document.uploaded, expense.created, trip.completed) | ✗ **[NOVO iz PDF-a]** | nema outbox tabele ni emitera |
| Idempotency-key na eventima | ~ | offline handleri su idempotentni (client uuid, `DUP_PK 23505` `handlers.ts:18`); **fali:** formalni event idempotency |
| Realtime (Supabase realtime/WebSocket) osvežavanje | ✗ | nema realtime sloja (web je pull/refetch) |

## 17) Navigation / telematika (§9) — *(korisnikova napomena: planirano poslednje/zamrznuto)*
| Zahtev | Stanje | Referenca |
|---|---|---|
| Location permission model / battery / GDPR osnov | ✗ | nema |
| Planned route + **`route_versions`** (verzionisana ruta) | ✗ **[NOVO iz PDF-a]** | nema `routes/route_versions` |
| Truck constraints model (visina/masa/osovine/ADR/emission) + telematics adapter | ✗ | nema (ADR `0010-gps-priprema` samo strategija) |

## 18) Tehnička arhitektura & data model (§10)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Modular monolith nad PostgreSQL/Supabase, domenske granice | ✓ | feature-first `src/features/*` + `api.ts` sloj; RLS/RPC |
| Storage: object storage + signed URL + lifecycle | ~ | `prilozi` bucket + signed URL `0008`; **fali:** lifecycle/retention politika |
| Canonical IDs (company/user/driver/vehicle/trailer/trip/document) | ✓ | uuid PK svuda; jedinstven identitet (ADR 0001) |
| Data model — postojeće tabele iz §10.2 | ✓ (deo) | companies/users(app_users)/drivers/vehicles/trailers/trips/trip_stops/trip_events/expenses/attachments/reminders/restrictions/resources/driver_month_rollups postoje |
| Data model — **nedostajuće** tabele iz §10.2 | ✗ | `company_memberships`(~employments), `roles/permissions`, `driver_profiles`(min), `driver_certifications`, `driver_preferences`, `vehicle_documents`, `maintenance_items`, `trip_assignments`, `routes/route_versions`, `notifications`, `audit_log`, `outbox_events`, `job_posts`, `job_applications/matches`, `marketing_leads` |
| Async job queue/outbox + retry/dead-letter (server-side) | ~ | offline red (client) ima retry/dead-letter (`queue.ts`); **fali:** serverski durable job/outbox |

## 19) Bezbednost, privatnost, compliance (§11)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| RLS/tenant izolacija od prvog dana + testovi A≠B | ✓ | RLS svuda; `supabase/tests/rls_audit_test.sql` postoji |
| Least privilege (vozač bez direktnog SELECT/UPDATE na finansije) | ✓ | view+RPC; `security_invoker` na P&L |
| Service-role samo server-side; nema u bundle-u | ✓ | Edge re-provera tenanta; audit: „nema tajne u repou" |
| Audit trail (role change, reassignment, financial, doc delete, billing) | ~ | delimično kroz `trip_events`; **fali:** `audit_log` tabela |
| GDPR (export/delete request, retention, DPA, privacy labels) | ✗ **[NOVO iz PDF-a]** | nema GDPR tokova |
| Audit High A1–A4 (2026-08) | ✓ **[ISPRAVKA]** | **ZATVORENI**: A1/A2/A3 u `0015_audit_fixes` (+ `0016`), na PROD-u (`remote 0026`); A4 offline dead-letter `queue.ts` (`MAX_ATTEMPTS=5`) + `queue.test.ts`. Detalji: `MASTER-PLAN-v2.md §2` |

## 20) Offline-first & sinhronizacija (§12)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Durable lokalna queue (status/trošak/km/attachment) preživljava restart | ✓ | `src/lib/offline/` (`queue.ts`, `sqliteQueueStore.ts`) |
| Client-generated idempotency (bez duplikata pri retry) | ✓ | client uuid + `DUP_PK` tretman `handlers.ts` |
| Attachment lifecycle (pending→uploading→uploaded→…) | ~ | pending→synced postoji; **fali:** verified/failed |
| Konflikti: server authoritative, append-only trip events | ✓ | `trip_events` append-only + `correct_trip_event` |
| Driver UI sync stanja (sačuvano/čeka/sinhronizovano/greška) | ✓ | bedž „čeka sinhronizaciju" + pending-count |

## 21) Skalabilnost & performanse (§13)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Indeksi `company_id` (+date), paginacija | ✓ | `0026_list_paging_indexes`; server paginacija (LoadMore) |
| Documents: kompresija/thumbnails/lifecycle/cold storage/metering | ~ | kompresija ✓ (native+web); **fali:** thumbnails/lifecycle/metering |
| Dashboards: rollups/materialized (ne skenirati raw) | ✓ (deo) | `driver_month_rollup` inkrementalni |
| **Cursor pagination + stabilan total ordering** | ✗ **[NOVO iz PDF-a]** | trenutno „shown+50" offset-stil, ne cursor |

## 22) i18n & lokalizacija (§14)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Sav UI kroz i18n ključeve (bez hard-coded) | ✓ | i18next; 30 jezika `src/locales/*` |
| Format datuma/decimale/valute/vremena | ✓ | `src/lib/format.ts` |
| Dark/light kao design tokens; driver dark mode | ✓ | `src/lib/theme.ts` (light+dark) |
| 30 jezika (sr/en autorski, ostalo mašinski, en fallback) | ✓ | `_status:"machine"` na mašinskim |
| Country-specific compliance verzionisan (source + valid_from/valid_to + language) | ~ | `restrictions` ima `source_url`+`valid_month`; **fali:** valid_to/language verzionisanje |
| Adresni format lokalizacija | ✗ | nema |

## 23) Marketing / growth agent (§15)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Zaseban servis (lead scoring, CRM lifecycle, `marketing_leads`), odvojen od core | ✗ **[NOVO iz PDF-a]** | ne postoji |

## 24) Monetizacija & entitlement (§16)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Osnov: paket + limit vozila | ✓ | `0013_company_plan_vehicle_limit` (+`enforce_vehicle_limit`); ADR 0009 |
| **Pretplata po aktivnom vozilu** (RevenueCat/IAP + B2B web billing) | ✗ | nema naplate (faza 3/4) |
| **Centralni entitlement service** (ne razbacan po UI) + usage metering | ✗ **[NOVO iz PDF-a]** | nema entitlement servisa ni meteringa |

## 25) API & integracioni standard (§17)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| No business logic only in frontend (server ponavlja validaciju/authz) | ✓ | RLS/RPC su prava kontrola |
| Versioned API contracts + generated TS types/schema validation | ~ | TS strict + feature `api.ts`; **fali:** versioned contracts / schema validacija |
| Idempotency-Key na finansijskim/retry write-ovima | ~ | offline idempotency (client uuid); **fali:** formalni `Idempotency-Key` header |
| Provider adapteri (SMS/email/maps/telematics/storage) | ✗ | nema adapter sloja (fx je zamenjiv, ali nije generalizovan) |

## 26) Engineering / CI-CD / okruženja (§18)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| GitHub repo, protected main, PR review | ✓ | GitHub; grana/PR tok |
| CI: lint + typecheck + unit | ✓ | `.github/workflows/ci.yml` (typecheck/lint/test) |
| Okruženja dev/staging/prod odvojena (baze/secrets) | ✓ | DEV/STAGING/PROD Supabase refs; EAS profili |
| Migracije immutable/versioned + rollback/forward-fix | ✓ | `supabase/migrations/NNNN_*.sql`; ritual (CLAUDE.md) |
| CI: **migration validation + RLS/security tests + build checks** | ~ | `rls_audit_test.sql` postoji ali **nije u CI**; nema migration-validation/build koraka |
| CODEOWNERS za security/data + feature flags | ✗ | nema CODEOWNERS; flag samo `EXPO_PUBLIC_PHONE_LOGIN` |

## 27) Test strategija (§19)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Unit (P&L, deadline, permission, normalization) | ✓ | `fx/rates.test`, `reminders/status`, `adminMath`, `phone`, `emailAuth`… (125 testova) |
| Offline replay/idempotency | ✓ | `src/lib/offline/queue.test.ts` |
| Security (cross-tenant, privilege escalation, signed URL, rate limits) | ~ | `rls_audit_test.sql` postoji; **fali:** u CI + escalation/rate-limit scenariji |
| Integration (trip create/assign, expense+doc, OTP) | ~ | jedinični da; **fali:** integracioni |
| E2E Web / E2E Mobile | ✗ | nema E2E |
| Load / Recovery / Store-Device | ✗ | nema |

## 28) Observability (§10/§18)
| Zahtev | Stanje | Referenca |
|---|---|---|
| **Sentry** + release tracking + structured logs (correlation id) | ✗ **[NOVO iz PDF-a]** | nema `Sentry` u `src/`/`app/`/`package.json` |
| Alerting za queue failures / auth anomalies; health/queue monitoring | ✗ | nema |

---

## KARIJERNI PROFIL RADNIKA (CV iz stvarnog rada) — vozač I dispečer
> Zahtev: profesionalni CV iz realnog rada — istorija zaposlenja, ukupno km, zemlje, broj/istorija tura,
> podaci za grafikon km po periodima. **Bez GPS/realtime lokacije.**

| Element CV-a | Stanje | Referenca | Priroda |
|---|---|---|---|
| **Istorija zaposlenja** (firme + periodi, od–do) | ✓ | `employments` `0017` (`role_on_company`, istorija od–do) | **PRIKAZ postojećih** (može rano) |
| **Broj i istorija tura** | ✓ | `trips` (po vozaču); `driver_trips` view | **PRIKAZ postojećih** |
| **Ukupno km** | ✓ | `trips.end_odometer−start_odometer` (`total_km` u view `0001:385`); `driver_month_rollup` | **PRIKAZ postojećih** |
| **Grafikon km po periodima (mesec)** | ✓ | `driver_month_rollup` (km po vozaču/mesecu) `0001:211` | **PRIKAZ postojećih** (agregat već postoji) |
| **Zemlje kroz koje je vozio** | ✗ | ture imaju `origin/destination`+stanice kao **slobodan tekst** (place), NEMA strukturisane zemlje po turi/ruti | **TRAŽI NOVE PODATKE** (strukturisana zemlja po stanici/ruti) |
| Preferencije (countries_of_interest/route_preferences/work_pattern/vehicle_experience) za CV/network | ✗ | ne postoje (§6) | **TRAŽI NOVE PODATKE / marketplace** |
| Sertifikati (C/CE, Code 95, ADR, licence) na CV-u | ✗ | nema `driver_certifications`/profil polja | **TRAŽI NOVE PODATKE** |

**Zaključak (činjenica):** „rani" CV-prikaz je moguć **odmah** iz postojećih tabela (`employments` + `trips` + `driver_month_rollup`):
zaposlenje, broj/istorija tura, ukupno km, grafikon km/mesec. **Zemlje, preferencije i sertifikati** traže **nove podatke**
(strukturisana zemlja po ruti + driver profil/certifikacije + network) i vezani su za §6 marketplace. Bez GPS-a.

---

## PREOSTALO ZA v2.0 (samo NEispunjeno; sortirano; S/M/L; ⛩ = jednosmerna vrata)
| # | Stavka | PDF § | Veličina | ⛩ |
|---|---|---|---|---|
| 1 | **Event/outbox sloj** (`outbox_events` + trip.created/driver.assigned/route.changed/document.uploaded/expense.created/trip.completed, idempotency) | §8, §10 | **L** | **⛩ DA** |
| 2 | **Role v2** (`fleet_manager`/`finance_manager`/`support_readonly`) + **više rola/kompanija** + **union dozvola** + `roles/permissions`/`company_memberships` | §4, §10.2 | **L** | **⛩ DA** |
| 3 | **Podela web portala** na module Dispatch/Fleet/Finance/Documents/Analytics (role-adapted view) | §3, §7, §22-kriterijum | **L** | **⛩ DA** |
| 4 | **Network/marketplace** (driver_preferences: countries_of_interest/route_preferences/work_pattern/vehicle_experience, `job_posts`/`matches`, data-collision guard) | §6, Faza 6 | **L** | **⛩ DA** |
| 5 | **Navigation/telematika** (location model, `route_versions`, truck constraints, telematics adapter) — *planirano poslednje* | §9 | **L** | **⛩ DA** |
| 6 | **Driver profil v2** (preferred_language, država, Code 95/ADR, `driver_certifications`, availability) + phone-first onboarding + OTP anti-abuse/recovery | §5, §10.2 | **M** | ~ (vezano za role/marketplace) |
| 7 | **`audit_log`** + audit trail (role/reassignment/financial/doc-delete/billing) | §7.12, §11 | **M** | ~ |
| 8 | **`notifications` tabela** + tipovi (assignment/route/missing-doc/status/doc-accepted) + email kanal | §7.11 | **M** | ne |
| 9 | **Documents modul** (samostalna arhiva, `vehicle_documents`, lifecycle verified/failed, virus/type validacija) | §7.3, §10.2 | **M** | ~ |
| 10 | **Fleet v2** (`maintenance_items`, vehicle lifecycle status, `trip_assignments` verzionisan) | §7.5, §7.1 | **M** | ~ |
| 11 | **Export Excel + async** (Edge exceljs, job) | §7.10 | **M** | ne |
| 12 | **Analytics/Reports** ekran (trenutno stub) + dashboards rollups | §7, §13 | **M** | ne |
| 13 | **Monetizacija** (pretplata po vozilu + **centralni entitlement service** + usage metering) | §16 | **M** | ~ (entitlement service ⛩) |
| 14 | **Observability** (Sentry + structured logs + alerting) | §10, §18 | **S** | ne |
| 15 | **CI hardening** (RLS/security testovi u CI, migration validation, build checks, CODEOWNERS) | §18 | **S–M** | ne |
| 16 | **Cursor pagination** (zamena offset „shown+50") | §13, §17 | **S** | ~ (API ugovor) |
| 17 | **GDPR tokovi** (export/delete request, retention, privacy labels) | §11 | **M** | ne |
| 18 | **Global search** (trip/driver/vehicle/document) | §7.12 | **M** | ne |
| 19 | **Karijerni profil — „zemlje kroz koje je vozio"** (strukturisana zemlja po stanici/ruti) | §7.9-CV | **S–M** | ~ (podatkovni model) |
| 20 | **Marketing/growth agent** (odvojen servis) | §15 | **L** | ⛩ (odvojen domen) |
| 21 | **E2E/Load/Recovery testovi** | §19 | **M–L** | ne |
| ~~22~~ | ~~Zatvaranje audit High A1–A4~~ → **ZATVORENO** (0015/0016 na PROD + offline dead-letter; v. `MASTER-PLAN-v2.md §2`) | §11 | — | — |
| 23 | **Realtime sloj** (Supabase realtime za dispatch/dashboard) | §8, §10 | **M** | ~ (vezano za event model) |

> „⛩ jednosmerna vrata" = odluke skupe za promeniti kasnije (event model, role/multi-firma, portal/driver podela,
> marketplace, GPS, entitlement service). Isporučeno (✓/~ iz gornjih tabela) se **ne** ponavlja ovde.
