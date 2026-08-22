# ETNOP — MASTER PLAN v2.0 (fazna isporuka)

> Ažuriran plan isporuke po **v2.0** (`docs/ETNOP_Senior_Projektni_Zadatak_v2.0 (1).pdf`) i gap mapi
> `docs/izvestaji/V2-GAP.md`. Jedini izvor istine za redosled rada; menja se samo odlukom vlasnika.
> Nadovezuje se na legacy plan `docs/MASTER-PLAN.md` (F0–F3 isporučeno). **Ovaj dokument ne menja kod/šemu.**

## Zaključane odluke vlasnika (v2.0)
- **Redosled posle F3:** (1) **Karijerni profil radnika**, (2) **Event/Outbox sloj** ⛩, (3) **Marketplace / mrežni profil** ⛩, (4) **Komercijalizacija** (pretplata po aktivnom vozilu + entitlement + metering).
- **Vizija lansiranja:** „ceo ekosistem pa u prodaju" — naplata je **kasno** (Faza 4).
- **GPS/telematika:** **POSLEDNJE**, kad sve ostalo gotovo (zamrznuto; ADR `0010-gps-priprema`).
- **Postojeće jezgro (60 ✓) se NE prepravlja** bez razloga — dograđuje se.

---

## 1) Gde smo — isporučeno (F0–F3, iz koda)
| Faza (legacy) | Isporučeno | Dokaz |
|---|---|---|
| **F0** Inženjersko osiguranje | RLS test paket, staging, ADR 0001–0011, audit + **ispravke A1–A4** | `supabase/tests/rls_audit_test.sql`; `docs/adr/*`; migracije `0015`,`0016` |
| **F1** Identitet/uloge/članstvo | profili + zaposlenja (od–do), pozivnice, dispečer rola, phone-OTP (flag) | `0017`,`0018`,`0019`,`0020`; `src/features/identity`,`auth` |
| **F2** Naručioci/fakture/compliance | customers + VIES, fakture+PDF, šifarnik rokova (datum+km), self-serve šifarnici | `0021`–`0025`; `src/features/customers`,`invoices`,`reminders`; Edge `vies-check` |
| **F3** Web + analitika + skala | web portal (owner/admin), paginacija+indeksi, kompresija slika, desktop-pass | `app/(owner)/*`, `0026`; `src/lib/webFile.ts`; `DesktopContainer` |

**Skor prema v2.0 (V2-GAP.md):** **60 ✓ / 34 ~ / 43 ✗** kroz 28 oblasti PDF-a.
North Star v1 (P&L ture) je isporučen (`trip_pnl` view, `security_invoker`).

## 2) PROVERA: audit High A1–A4 — ZATVORENI ✓ (ispravka gap mape)
> Gap mapa (stavka 22) ih je vodila kao „preostalo". **Provera iz koda pokazuje da su A1–A4 zatvoreni** —
> izbacuju se iz „preostalog":

| Nalaz | Stanje | Dokaz (iz koda) |
|---|---|---|
| **A1** — dnevnik ponovo dobio owner UPDATE/DELETE (0014) | ✓ zatvoreno | `0015`: `drop policy events_owner` → ostaju samo `events_select_owner`+`events_insert_owner` (append-only vraćen; UPDATE/DELETE nemaju politiku) |
| **A2** — `platform_admin` čitao/pisao dnevnik svih firmi | ✓ zatvoreno | `0015`: `events_select/insert_owner` rekreirani **bez** `platform_admin` grane; `correct_trip_event` (0015/0016) skinuo admin granu |
| **A3** — suspenzija firme samo klijentska (fail-open) | ✓ zatvoreno | `0015`: `company_is_active()` SECURITY DEFINER + **RESTRICTIVE** write-gate na trips/expenses/attachments/vehicles/trailers/drivers/reminders/trip_stops/`storage.objects`; SECURITY DEFINER RPC-ovi (`correct_trip_event`, `driver_update_trip_progress`) eksplicitno blokiraju obustavu |
| **A4** — offline poison zamrzava red zauvek | ✓ zatvoreno | `src/lib/offline/queue.ts`: `MAX_ATTEMPTS=5` → dead-letter, **red nastavlja**; korisniku vidljivo (`listDeadLetter`/`removeDeadLetter`); test `queue.test.ts` (poison → dead-letter + red NASTAVLJA) |

**Na PROD-u:** `supabase migration list` → `remote 0026` (0015/0016 su sekvencijalno primenjeni). A4 je klijentski (u buildu).
**Zaključak:** A1–A4 su zatvoreni; nova „bezbednosna" stavka u v2.0 je **`audit_log`** tabela (§11 — to je NOVO, ne A1–A4).

---

## 3) FAZE v2.0 (po zaključanom redosledu)

### FAZA v2-1 — KARIJERNI PROFIL RADNIKA (vozač i dispečer)  ·  **M**  ·  mini-⛩
**Cilj:** profesionalni CV iz stvarnog rada — bez GPS-a. Najviše **prikaz postojećih podataka**, uz jedan nov strukturisan podatak (ruta→zemlja). Detaljne kriške u §4.
**IZLAZNA KAPIJA:** vozač i dispečer imaju CV ekran (zaposlenja, broj/istorija tura, ukupno km, grafikon km/period); „zemlje" rade tamo gde postoji strukturisan podatak; native+web; i18n 30.
**ADR pre početka (mini-⛩):** „**geografija po stanici/ruti**" — zemlja je **odvojeno** polje (ISO), NE meša se sa interesom/oglasom/prebivalištem/lokacijom (**data-collision guard §6**).

### FAZA v2-2 — EVENT / OUTBOX sloj  ·  **L**  ·  **⛩ DA**
**Cilj:** temelj za realtime, notifikacije i marketplace. Domenski eventi kroz durable outbox + workers.
**Kriške:**
1. `outbox_events` tabela (append-only) + emitovanje u istoj transakciji sa poslovnim upisom.
2. Imenovani eventi: `trip.created`, `driver.assigned`, `route.changed`, `document.uploaded`, `expense.created`, `trip.completed` (PDF §8) — svaki sa **idempotency key**.
3. Worker/dispečer isporuke (retry + dead-letter + observability) — server-side (ne klijentski red).
4. Prvi consumer: notifikacije (`notifications` tabela + tipovi) i rollup okidači.
5. (opciono) Realtime kanal za owner/dispatch osvežavanje.
**IZLAZNA KAPIJA:** kreiranje/dodela ture emituje event; consumer ga obradi idempotentno; retry/dead-letter dokazani testom; nema dvostruke obrade.
**ADR pre početka (⛩):** ✅ **`0012-event-outbox` PRIHVAĆEN** (22.8.2026, potpis vlasnika) — pokriva oblik envelope-a, idempotency ključ, at-least-once + idempotent consumer, verzionisanje event šeme, i realtime kao osvežavanje (ne izvor istine). Kapija otvorena: implementacija sme da počne.

### FAZA v2-3 — MARKETPLACE / MREŽNI PROFIL  ·  **L**  ·  **⛩ DA**
**Cilj:** nezavisna registracija vozača/dispečera; firme ih nalaze i pozivaju. Gradi na event sloju (v2-2).
**Kriške:**
1. `driver_preferences` (odvojena polja: `countries_of_interest`, `route_preferences`, `work_pattern`, `vehicle_experience`, availability, relocation) — **data-collision guard** (§6, §23).
2. `driver_certifications` (C/CE, Code 95+expiry, ADR, licence) — strukturisano.
3. `job_posts` + `job_applications/matches` + matching score (unit-testabilan).
4. Verifikacija firmi/vozača; vidljivost i privatnost preko role/RLS (firma B ne vidi tuđe employment podatke).
5. **Marketing/growth agent** ostaje **odvojen servis** (§15) — ne meša se sa core/driver podacima.
**IZLAZNA KAPIJA:** vozač napravi mrežni profil nezavisno od firme; firma pretraži po zemlji/ruti i pošalje ponudu; nijedno geo polje nije spojeno; cross-tenant negativni test prolazi.
**ADR pre početka (⛩):** „**driver network profil i data-collision guard**" (odvojena geo polja, izvor/valid_from-to); „**matching i vidljivost**" (šta firma sme da vidi pre pristanka vozača); „**verifikacija**".

### FAZA v2-4 — KOMERCIJALIZACIJA  ·  **M–L**  ·  **⛩ (entitlement service)**
**Cilj:** naplata (kasno, po viziji „ekosistem pa prodaja"): pretplata po **aktivnom vozilu**.
**Kriške:**
1. **Centralni entitlement service/policy** (feature access na jednom mestu, ne razbacano po UI) — ⛩.
2. **Usage metering** (aktivna vozila, storage, add-ons).
3. Billing kanal: B2B web billing (odvojeno, pravno po tržištu) + IAP samo gde store policy traži (§16).
4. Onboarding funnels, company invites, support tooling.
**IZLAZNA KAPIJA:** feature access ide isključivo kroz entitlement service; metering broji aktivna vozila; prva pretplata naplaćena u test tržištu.
**ADR pre početka (⛩):** „**entitlement model**" (po aktivnom vozilu, tiers/add-ons, gde se odlučuje pristup); „**billing kanal**" (web B2B vs IAP po tržištu).

### FAZA v2-Z — GPS / TELEMATIKA  ·  **L**  ·  **⛩ DA**  ·  *(POSLEDNJE, zamrznuto)*
**Cilj:** tek kad je sve ostalo gotovo. Architecture-ready po §9.
**Kriške:** location permission/battery/GDPR model; `route_versions` (verzionisana ruta); truck constraints entiteti; telematics **adapter** sloj (bez vendor lock-in).
**IZLAZNA KAPIJA:** živa tačka/trag SAMO tokom ture, uz pravni osnov i vidljivo stanje praćenja.
**ADR pre početka (⛩):** „**location/privacy/GDPR**"; „**route_versions**"; „**telematics adapter**".

> **Paralelno/uz svaku fazu (nose se kao „Definition of Done", §25):** i18n 30, loading/empty/error/offline stanja,
> testovi (unit + permission/offline), i po potrebi **Observability (Sentry)** — jeftina S stavka koja može ući rano
> uz Fazu v2-2 (event failure vidljivost). Ove nisu zasebne faze nego DoD kroz sve.

---

## 4) FAZA v2-1 (Karijerni profil) — razrađene kriške
> Prva na redu. Razdvojeno: **prikaz postojećih** (može odmah) vs **nov podatak**. **Bez GPS-a.**

### 4.1 Iz POSTOJEĆIH tabela (bez šeme; može odmah)
| CV element | Izvor | Napomena |
|---|---|---|
| Istorija zaposlenja (firme + periodi od–do) | `employments` (`0017`, `role_on_company`, istorija) | vozač i dispečer; preživljava promenu firme |
| Broj i istorija tura | `trips` po vozaču; view `driver_trips` | lista + brojač |
| Ukupno km | `trips.end_odometer−start_odometer` (`total_km` u view `0001:385`) | zbir po vozaču |
| **Grafikon km po periodima (mesec)** | `driver_month_rollup` (`0001:211`) | agregat već postoji → direktan chart |

### 4.2 NOV podatak (traži šemu + ADR)
| Element | Šta treba | Guard |
|---|---|---|
| „Zemlje kroz koje je vozio" | strukturisana **zemlja po stanici/ruti** (ISO), izvedeno u profil | **data-collision guard**: zemlja rute ≠ zemlja interesa ≠ prebivalište ≠ lokacija (odvojena polja) |

### 4.3 Ekrani
- **Vozač CV** (mobilni + web): zaposlenja, ture (broj/istorija), ukupno km, grafikon km/mesec; kasnije „zemlje".
- **Dispečer CV**: isti okvir (zaposlenja + operativni doprinos); finansije po istoj privatnosti kao dosad.
- Prikaz kroz feature `api.ts` sloj; boje iz tokena; stringovi kroz `t()` (30 jezika).

### 4.4 Šta NIJE u ovoj fazi
Marketplace preferencije (countries_of_interest/route_preferences) i sertifikati — to je **Faza v2-3** (nov domen). CV rani prikaz ih ne čeka.

---

## 5) Rizici i napomene
- **„Sve pa prodaja" (naplata kasno):** vizija je zaključana. **Poštena napomena (ne namećem):** duži put do **prvog prihoda** i do **povratne informacije tržišta** — pilot firme i rano lansiranje jezgra daju validaciju pre nego što se izgrade ⛩ slojevi (event/marketplace). Alternativa (rano lansiranje jezgra uz naplatu) nije zaključana; iznosi se samo kao informacija za vlasnika.
- **Redosled ⛩:** event sloj **pre** marketplace-a je nameran (v. §6). Preskakanje reda znači skupu doradu kasnije.
- **Postojeće jezgro se ne dira** bez razloga (60 ✓); dograđivanje kroz nove tabele/module (canonical ID pravilo §10.2).
- **Migracije:** DEV → STAGING proba → PROD uz izričito odobrenje (nepromenjeno). Svaka faza ima IZLAZNU KAPIJU.
- **A1–A4 zatvoreni** (v. §2) — nisu rizik; novi bezbednosni rad je `audit_log` (§11) i GDPR tokovi.

## 6) Jednosmerna vrata — redosled i zašto
| ⛩ Odluka | Zašto tim redom (pre čega) |
|---|---|
| **Event/Outbox (v2-2) PRE Marketplace (v2-3)** | marketplace, notifikacije i realtime **konzumiraju** evente (`driver.assigned`, `document.uploaded`…). Graditi marketplace bez event sloja znači ad-hoc sinhronizaciju koja se kasnije skupo prepravlja. |
| **Role/multi-firma model PRE portala i marketplace-a** | `fleet_manager/finance_manager/support_readonly` + union dozvola + `company_memberships` menjaju RLS temelj; portal podela i marketplace vidljivost zavise od njih. *(Ako se otvara — ADR „role v2" prvi.)* |
| **Data-collision guard PRE bilo kog geo podatka** (v2-1 „zemlje", v2-3 preferencije) | spajanje geo polja (interes/oglas/firma/prebivalište/lokacija) kasnije traži migraciju i kvari targetiranje (§6, §23). Odvojena polja od prvog upisa. |
| **Entitlement service PRE naplate (v2-4)** | feature access mora biti centralan; razbacan po UI-ju se kasnije ne može bezbedno konsolidovati. |
| **Canonical IDs / jedan backend (guardrail §27)** | svaka paralelna baza/identitet zahteva zaseban ADR; app split je UX odluka, ne data split. |
| **GPS poslednje (v2-Z)** | privatnost/GDPR + `route_versions` + adapter sloj su skupi i nose pravni rizik; ne blokiraju core. |

> Pravilo (PDF §27): svaka odluka koja uvodi paralelnu bazu/identitet ili sinhronizaciju između „ETNOP aplikacija"
> mora se opravdati posebnim **ADR-om** pre početka.
