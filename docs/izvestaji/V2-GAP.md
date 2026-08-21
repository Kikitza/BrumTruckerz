# v2.0 GAP MAPA — zahtevi v2.0 naspram STVARNOG koda

> **Napomena o izvoru (činjenica):** traženi dokument `docs/ETNOP-Senior-Projektni-Zadatak-v2.0.pdf` **NE postoji
> u repou** (nema nijednog PDF-a, ni fajla sa „v2"/„senior"/„2.0"). Zato je **zahtev-strana** ovog dokumenta uzeta iz
> **spiska oblasti/zahteva nabrojanih u samom zadatku** (to je v2.0 skup koji je vlasnik dao), a **stvarnost-strana**
> je čitana iz koda/šeme (migracije 0001–0026, `src/features/`, Edge funkcije, `app.config`, ADR-ovi). Ako se doda pravi
> PDF, pass se može pooštriti. **Ovo je samo činjenično stanje — bez mišljenja/preporuka.**
>
> Oznake: **✓ IMAMO** · **~ DELIMIČNO** (uz „fali:") · **✗ NEMA**.

---

## 1) Identitet & role
| Zahtev v2.0 | Stanje | Referenca / „fali" |
|---|---|---|
| Osnovne role (admin/owner/driver) | ✓ | `user_role` enum `0001_init.sql:15` (`platform_admin,owner,driver`) |
| Dispečer (office) rola | ✓ | `0020_dispatcher_office_role.sql` (enum ADD VALUE + `is_office_role()`); ADR 0003 |
| Nove role **fleet_manager / finance / support** | ✗ | enum ima samo 4 vrednosti; `employments.role_on_company in ('driver','dispatcher')` `0017:64` — nove role NE postoje |
| Članstvo u **više firmi** (membership) | ~ | Substrat postoji: `employments` (osoba↔firma sa istorijom od–do) `0017`; ALI `app_users` nosi **jednu** `company_id`+`role` `0001:36-44`, a `current_company_id()/current_role_name()` čitaju **jednu** firmu `0001:228-241`. **fali:** aktivna-firma prebacivanje + rešavanje uloge po firmi |
| **Union** dozvola (spoj prava kroz više firmi) | ✗ | RLS se rešava po jednoj tekućoj firmi (`current_company_id()`); nema union modela |

## 2) Onboarding & OTP
| Zahtev | Stanje | Referenca |
|---|---|---|
| Email prijava/registracija | ✓ | `app/(auth)/sign-in.tsx`, `src/features/auth/EmailSignUp.tsx` (email+lozinka; OTP/magic link „pred produkciju") |
| Telefon (OTP) iza flaga | ✓ | `src/features/auth/phone.ts` `isPhoneLoginEnabled` (`EXPO_PUBLIC_PHONE_LOGIN`), `PhoneOtpSteps.tsx`, `PhoneSignIn.tsx`; prod flag `0` u `eas.json` |
| Bootstrap naloga (pozivnice/kod) | ✓ | `0018_invitations.sql`, `0019_…name_fallback`, `accept_invitation` RPC; `AcceptInviteBox.tsx` |

## 3) Trips & dispatch model
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Tura + status tok | ✓ | `trips` + `trip_status` enum `0001:16,86`; `0003_trip_route_medical` |
| Trojka dodela (vozač+truk+prikolica) | ✓ | `trips` FK + `ownerUpdateTripAssignment` (`src/features/trips/api.ts`, `TripDetailModal.tsx`) |
| Stanice (utovar/istovar, redosled) | ✓ | `0010_trip_stops.sql`; `src/features/trips/stops.tsx` |
| Dnevnik događaja append-only + ispravka | ✓ | `trip_events` `0001:116`; `correct_trip_event` `0016_correct_event_idempotent` |
| Vozačev tok bez finansija (view+RPC) | ✓ | `driver_trips` view + `driver_update_trip_progress` (`0001`, `0009_driver_trip_access_helper`) |
| **Formalni dispatch** (tabla naloga/dodela kroz dispečere, zahtevi za zamenu truka/prikolice) | ~ | dispečer-rola postoji (0020) i deli owner sekciju; ALI „dispečerski međusobni zahtevi za zamenu" su **ODLOŽENI** (CLAUDE.md „Dispečer je ODLOŽEN"); nema zasebnog dispatch modela/UI |

## 4) Troškovi & P&L
| Zahtev | Stanje | Referenca |
|---|---|---|
| Troškovi (kategorije) | ✓ | `expenses` + `expense_category` enum `0001:18,129`; `0006_expenses_created_by` |
| Multivaluta (original+fx, base kod) | ✓ | `0002_multicurrency_audit.sql`; `src/features/fx/` (frankfurter/ECB), `rates.test.ts` |
| **P&L ture u baznoj valuti** | ✓ | view `trip_pnl` sa `security_invoker=on` `0002:77`; čita ga owner P&L ekran |

## 5) Dokumenti (generički prilozi)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Prilozi (slike) uz turu/trošak, privatan bucket, potpisani URL | ✓ | `attachments` `0001:146` + `0008_storage_prilozi`; `src/features/attachments/` |
| Kompresija pre uploada (native+web) | ✓ | native `src/lib/image.ts`; web `src/lib/webFile.ts` `compressImageForUpload` |
| **Zaseban „Documents" modul** (generička arhiva van ture/troška) | ✗ | prilozi su vezani za `trip_id`/`expense_id`; nema samostalnog dokument-entiteta/modula |

## 6) Fleet & compliance (rokovi/šifarnik/km)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Vozila/prikolice/vozači CRUD | ✓ | `0001:49-83`; `src/features/fleet/`, `app/(owner)/fleet.tsx` |
| Rokovi (datum + km) + šifarnik tipova | ✓ | `reminders` `0001:160` + `0004_reminders_label_issued` + `0024_reminder_types_km`; km režim `0011_trip_event_km` |
| Prag opomene / notified_stage | ✓ | `0012_reminder_notified_stage.sql` |
| Šifarnici zemalja / tipova vozila (self-serve) | ✓ | `0025_countries_vehicle_types_self_serve.sql` |

## 7) Naručioci & fakture & VIES
| Zahtev | Stanje | Referenca |
|---|---|---|
| Naručioci (customers) | ✓ | `0021_customers.sql`; `src/features/customers/` |
| VIES provera PDV-a | ✓ | `0022_customers_vies.sql`; Edge `vies-check`; `vies.ts`/`vies.test.ts` |
| Fakture (izdavanje, PDV, PDF) | ✓ | `0023_invoices.sql`; `src/features/invoices/` (pdf.ts: pdf-lib/HTML→print) |

## 8) Offline & sinhronizacija
| Zahtev | Stanje | Referenca |
|---|---|---|
| Lokalni red (enqueue/flush/retry), preživljava restart | ✓ | `src/lib/offline/` (`queue.ts`, `handlers.ts`, `sqliteQueueStore.ts` + `.web.ts`); `queue.test.ts` (retry/poison/dead-letter) |
| Web = uvek online (bez reda) | ✓ | ADR 0011; web nema `expo-sqlite`/flush |

## 9) Notifikacije (push infrastruktura)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Push tokeni | ✓ | `push_tokens` (`0002`, `0012`); `src/features/notifications/registerPush.ts` |
| Cron opomene (Edge) | ✓ | `supabase/functions/reminders-cron` (PROD ACTIVE, `x-cron-secret`, 07:00 Europe/Belgrade) |
| FCM/build veza (pravi telefon) | ✓ | `google-services.json` (`entop-98f50`) + `app.config` `googleServicesFile`; FCM V1 na expo.dev; build vc6 |

## 10) WEB portal — moduli koje v2.0 traži
| Modul v2.0 | Stanje | Referenca / „fali" |
|---|---|---|
| **Dispatch** | ~ | `app/(owner)/trips/index.tsx` (lista/detalj tura, dodela) — nema zasebne dispatch table/tokova |
| **Fleet** | ✓ | `app/(owner)/fleet.tsx` (desktop-pass, DataTable) |
| **Finance** | ~ | `invoices.tsx` + `customers.tsx` postoje; **fali:** objedinjen Finance modul + analitika/izveštaji |
| **Documents** | ✗ | nema samostalnog modula (prilozi su unutar ture/troška) |
| **Analytics** | ✗ | `app/(owner)/reports.tsx` je **stub** („reports — TODO") |

## 11) Event / outbox sloj (trip.created, driver.assigned, document.uploaded…)
| Zahtev | Stanje | Referenca |
|---|---|---|
| Formalni event/outbox (domain events, isporuka spolja) | ✗ | Nema `outbox`/`event_log`/`domain_event` tabele ni emitera (grep prazan). `trip_events` je **poslovni dnevnik ture**, NE tehnički event/outbox sloj |

## 12) Network / marketplace (driver network profil)
| Zahtev | Stanje | Referenca |
|---|---|---|
| `countries_of_interest`, `route_preferences` | ✗ | Ne postoje (grep prazan) |
| Marketplace / mrežni profil vozača | ✗ | Ne postoji |
| Data-collision guard | ✗ | Ne postoji |

## 13) Telematika / GPS
| Zahtev | Stanje | Referenca |
|---|---|---|
| GPS/telematika | ✗ (**planirano poslednje / zamrznuto**) | Samo priprema/strategija: ADR `0010-gps-priprema-i-ecmr-strategija.md`; nema tabela/koda |

## 14) Bezbednost & RLS
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| RLS uključen + tenant izolacija (`company_id`) | ✓ | RLS na svim tenant tabelama (`0001` naovamo); audit: „izolacija firmi je **jaka**" (`docs/AUDIT-SAZETAK.md`) |
| Finansijska poverljivost prema vozaču | ✓ | kolonska privatnost kroz view+RPC, `security_invoker` na P&L (audit potvrđuje) |
| Otvorene stavke iz audita (2026-08) | ~ | audit našao **0 Critical / 4 High**: A1 dnevnik ponovo dobio owner UPDATE/DELETE (`events_owner` u 0014), A2 `platform_admin` nije isečen sa `trip_events`, A3 suspenzija firme samo klijentska (fail-open), A4 offline poison. **fali:** potvrda da su A1–A4 zatvoreni u tekućoj šemi (`docs/AUDIT-BRUMTRUCKERZ-2026-08.md`) |

## 15) i18n (30 jezika)
| Zahtev | Stanje | Referenca |
|---|---|---|
| 30 jezika, sr/en autorski, ostalo mašinski, en fallback | ✓ | `src/locales/*.json` (30 fajlova); `src/i18n/languages.ts`; mašinski fajlovi nose `_status:"machine"` |

## 16) Monetizacija (po aktivnom vozilu)
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Osnov: paket + limit vozila | ✓ | `0013_company_plan_vehicle_limit.sql` (`plan`, `vehicle_limit`, `enforce_vehicle_limit` trigger); ADR `0009-entitlementi-i-paketi` |
| **Naplata po aktivnom vozilu (RevenueCat, pretplata)** | ✗ | Nema `purchases`/RevenueCat integracije (faza 3 po CLAUDE.md); postoji samo limit-osnov |

## 17) Skala & observability
| Zahtev | Stanje | Referenca / „fali" |
|---|---|---|
| Paginacija + indeksi | ✓ | `0026_list_paging_indexes.sql`; server paginacija (`LoadMore`, „shown+50") na listama |
| Indeksi vođeni `company_id` | ✓ | konvencija kroz migracije (npr. `app_users` `0001:44`, 0026) |
| **Observability (Sentry)** | ✗ | Nema `sentry`/`Sentry` nigde u `src/`/`app/`/`package.json` |

---

## PREOSTALO ZA v2.0 (samo NEispunjeno; sortirano; S/M/L; ⛩ = jednosmerna vrata)

| # | Stavka | Oblast | Veličina | ⛩ Jednosmerna vrata |
|---|---|---|---|---|
| 1 | **Event/outbox sloj** (trip.created, driver.assigned, document.uploaded…) | (11) | **L** | **⛩ DA** — oblik događaja/ugovora je skup za menjanje kasnije |
| 2 | **Model role v2** (fleet_manager/finance/support) + **članstvo u više firmi** + **union dozvola** | (1) | **L** | **⛩ DA** — role/permisije su temeljna šema, migracija RLS-a rizična |
| 3 | **Podela portala** Dispatch/Fleet/Finance/Documents/Analytics (moduli) | (10) | **L** | **⛩ DA** — informaciona arhitektura/rute, skupo prekrajati |
| 4 | **Documents** kao samostalan modul/entitet (arhiva van ture/troška) | (5,10) | **M** | ~ (blisko event/role odlukama) |
| 5 | **Analytics/Reports** ekran (trenutno stub) | (10) | **M** | ne |
| 6 | **Finance** objedinjen modul (fakture+naručioci+P&L+izveštaji) | (10) | **M** | ne |
| 7 | **Formalni dispatch** (dispečerski tokovi/zamene — trenutno ODLOŽENO) | (3) | **M** | ~ (vezano za role/portal podelu) |
| 8 | **Network/marketplace** profil vozača (countries_of_interest, route_preferences, data-collision guard) | (12) | **L** | **⛩ DA** — nov domen + deljenje podataka između firmi |
| 9 | **Monetizacija po aktivnom vozilu** (RevenueCat pretplata) | (16) | **M** | ne (osnov limita već postoji) |
| 10 | **Observability (Sentry)** integracija | (17) | **S** | ne |
| 11 | **Zatvaranje audit High A1–A4** (ako još otvoreni: dnevnik owner-write, platform_admin/trip_events, suspenzija RLS, offline poison) | (14) | **S–M** | ne (ali bezbednosno bitno) |
| 12 | **GPS/telematika** | (13) | **L** | **⛩ DA** (svesno **poslednje/zamrznuto**) |

> Napomene: „✓/~" stavke iz gornjih tabela se **ne** ponavljaju ovde (isporučeno). Veličine su gruba procena iz obima
> koda/šeme, ne planovi rada. „⛩ jednosmerna vrata" = odluke skupe za promeniti kasnije (event model, role model,
> portal/driver podela, marketplace, GPS).
