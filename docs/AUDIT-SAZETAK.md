# BrumTruckerz — Audit Summary / Sažetak audita (2026-08-19)

Bilingual condensation of the full report / Dvojezični izvod iz punog izveštaja: **`docs/AUDIT-BRUMTRUCKERZ-2026-08.md`**.
Contains: Executive Summary, Final Verdict, and §28/§29/§30 in English and Serbian.
Sadrži: Rezime, Konačan sud, i §28/§29/§30 na engleskom i srpskom.

> No secret values are quoted anywhere — only names and locations. / Nigde se ne citiraju vrednosti tajni — samo imena i mesta.

---

## Executive Summary (EN)

BrumTruckerz is a soundly-architected multi-tenant app whose core security invariants are, for the most part, correctly implemented in the database — **tenant isolation is strong**, **driver financial confidentiality is well-designed** (column-privacy via views + RPCs, `security_invoker` on the P&L views), the **Edge Functions correctly re-check tenancy** on the service-role path, and **no non-public secret is present in the repository**. Build health is green: typecheck clean, lint clean (5 warnings), 58/58 tests passing.

The audit found **0 Critical, 4 High, 8 Medium, 13 Low, 5 Info** findings. There is **no confirmed cross-tenant data breach**. The four High findings are all confirmed and cluster around two themes:

1. **Two security invariants were silently reopened / left ajar by migration 0014.** The append-only event diary regained owner UPDATE/DELETE (`events_owner … FOR ALL`, A1), and `platform_admin` was never actually cut from the `trip_events` content (A2) — so the operator can still read every tenant's operational log, weakening the very least-privilege goal 0014 set out to achieve.
2. **Two enforcement points live only in the client.** Company suspension is a client-side redirect that fails open, with no RLS backing (A3); and the offline queue can be frozen forever by a single failing mutation (A4), with a related cross-tenant flush risk on shared devices (B4).

None of these require exotic conditions — A1/A2 are provable from policy source, A3/A4 from a few lines of client code. The most consequential process gap is that CLAUDE.md's own required test suites (offline queue, RLS A≠B, correct-event chain) do not exist (B8) — a regression test would have caught A1 at author time.

## Rezime (SR)

BrumTruckerz je dobro arhitektiran višefirmski sistem čije su ključne bezbednosne invarijante većinom ispravno sprovedene u bazi — **izolacija firmi je jaka**, **finansijska poverljivost prema vozaču je dobro projektovana** (kolonska privatnost kroz view-ove + RPC, `security_invoker` na P&L pogledima), **Edge funkcije ispravno re-proveravaju pripadnost firmi** na service-role putanji, i **u repou nema nijedne neprivatne tajne**. Zdravlje builda je zeleno: typecheck čist, lint čist (5 upozorenja), 58/58 testova prolazi.

Audit je našao **0 kritičnih, 4 visoka, 8 srednjih, 13 niskih, 5 informativnih** nalaza. **Nema potvrđenog curenja podataka između firmi.** Sva četiri visoka nalaza su potvrđena i grupišu se oko dve teme:

1. **Dve bezbednosne invarijante je migracija 0014 tiho ponovo otvorila / ostavila odškrinutima.** Append-only dnevnik događaja je vratio vlasniku UPDATE/DELETE (`events_owner … FOR ALL`, A1), a `platform_admin` zapravo nikad nije odsečen od sadržaja `trip_events` (A2) — pa operator i dalje može da čita operativni dnevnik svake firme, čime se slabi upravo cilj najmanjih privilegija koji je 0014 trebalo da postigne.
2. **Dve tačke sprovođenja žive samo u klijentu.** Obustava firme je klijentsko preusmerenje koje „pada otvoreno" (fail-open), bez RLS podrške (A3); a offline red se može zauvek zamrznuti jednom neuspešnom mutacijom (A4), uz srodni rizik prelivanja između firmi na deljenom uređaju (B4).

Nijedan od ovih ne traži egzotične uslove — A1/A2 se dokazuju iz izvora politika, A3/A4 iz par linija klijentskog koda. Najozbiljniji procesni propust je da propisane test-svite iz samog CLAUDE.md (offline red, RLS A≠B, lanac ispravki događaja) ne postoje (B8) — regresioni test bi uhvatio A1 još pri pisanju.

---

## Final Verdict (EN)

**Conditional pass — not production-ready until the four High findings are closed.** The foundation is trustworthy: tenant isolation, driver column-privacy, and Edge authorization are correctly built, and there is no cross-tenant breach or leaked secret. But two of the product's marquee guarantees — an immutable audit trail and an operator who cannot see customer operations — are currently **not enforced** because of the 0014 policy regression (A1, A2), and two client-only enforcement points (A3 suspension, A4 queue) are fragile. These are small, well-localized fixes: essentially one corrective migration (A1+A2), one RLS/client suspension change (A3), and one queue dead-letter mechanism (A4), each with an accompanying test. Ship the P0 backlog (Appendix A) plus the three missing test suites (B8) **before** the next PROD migration and before onboarding real customers; the P1/P2 items can follow on the normal cadence. With P0 closed, the system is in good shape.

## Konačan sud (SR)

**Uslovno prolazi — nije spremno za produkciju dok se ne zatvore četiri visoka nalaza.** Temelj je pouzdan: izolacija firmi, kolonska privatnost vozača i Edge autorizacija su ispravno napravljeni, i nema curenja između firmi ni procurele tajne. Ali dve reklamne garancije proizvoda — nepromenljiv revizioni trag i operator koji ne vidi poslovanje klijenta — trenutno **nisu sprovedene** zbog regresije politika u 0014 (A1, A2), a dve isključivo klijentske tačke sprovođenja (A3 obustava, A4 red) su krhke. To su male, dobro lokalizovane ispravke: u suštini jedna korektivna migracija (A1+A2), jedna izmena RLS/klijentske obustave (A3), i jedan mehanizam „mrtvog pisma" za red (A4), svaka sa pratećim testom. Isporuči P0 listu (Dodatak A) plus tri nedostajuće test-svite (B8) **pre** sledeće PROD migracije i pre uvođenja pravih klijenata; P1/P2 stavke mogu ići uobičajenim tempom. Kada se P0 zatvori, sistem je u dobrom stanju.

---

## §28 — Dependencies, Supply Chain, Build & CI/CD (EN)

**Medium (B6):** `npm audit --omit=dev` reports 22 advisories (11 high, 11 moderate, 0 critical), all in the Expo/Metro **build toolchain** (roots: `image-size` ICNS DoS, `postcss` XSS via `metro`/`@expo/*`; `uuid` via `xcode`) — prebuild/dev tooling that does not ship in the client bundle, so real runtime exposure is low; resolution tracks upstream Expo SDK 54 patches. **Positives:** Expo 54 / RN 0.81 / React 19 are aligned and consistent; no install scripts; `package-lock` v3 + `npm ci` = reproducible; `tsconfig` `strict:true`; `.env` untracked; DEV (`preview`) and PROD (`production`) backends cleanly separated in `eas.json`; CI runs `npm ci → typecheck → lint → test` with no secret dependency and no env leakage. **Low:** production EAS profile builds an internal **APK** (needs **AAB** for Play, C11); `RUNBOOK.md:34` offers a SQL-Editor migration path contradicting the CLAUDE.md ritual (C12); CI Node pinned to major `20` only (C13).

## §28 — Zavisnosti, lanac snabdevanja, build i CI/CD (SR)

**Srednje (B6):** `npm audit --omit=dev` prijavljuje 22 upozorenja (11 visokih, 11 srednjih, 0 kritičnih), sva u **build alatima** Expo/Metro (koreni: `image-size` ICNS DoS, `postcss` XSS kroz `metro`/`@expo/*`; `uuid` kroz `xcode`) — alati za prebuild/razvoj koji se ne isporučuju u klijentskom bundle-u, pa je stvarna izloženost u radu niska; rešenje prati uzvodne zakrpe Expo SDK 54. **Pozitivno:** Expo 54 / RN 0.81 / React 19 su usklađeni i konzistentni; nema install skripti; `package-lock` v3 + `npm ci` = reproducibilno; `tsconfig` `strict:true`; `.env` nije praćen; DEV (`preview`) i PROD (`production`) baze su čisto razdvojene u `eas.json`; CI vrti `npm ci → typecheck → lint → test` bez zavisnosti od tajni i bez curenja env-a. **Nisko:** produkcioni EAS profil pravi interni **APK** (za Play treba **AAB**, C11); `RUNBOOK.md:34` nudi migraciju kroz SQL Editor što je u suprotnosti sa ritualom iz CLAUDE.md (C12); CI Node zaključan samo na major `20` (C13).

## §29 — Test Coverage & Verification Gaps (EN)

Ground-truth build health this audit: **typecheck 0 errors**, **lint 0 errors / 5 warnings**, **58/58 tests across 9 suites**. But those suites are **pure-function units only** (fx, stops, events, notification-stage, num, base64, adminMath, uuid, plan). CLAUDE.md explicitly requires tests for the **offline queue (enqueue/flush/retry)**, **RLS (company A ≠ B)**, and the **`correct_trip_event` version chain** — **none exist (B8, Medium)**. This is the most consequential process gap: the two highest-severity confirmed findings (A1 append-only regression, A4 queue freeze) live in exactly these untested surfaces, and a regression test would have caught A1 at author time. **Fix:** (a) RLS test — owner UPDATE/DELETE on `trip_events` rejected + admin reads 0 rows of another company; (b) queue test — retry / poison-message / user-scoping; (c) `correct_trip_event` chain test.

## §29 — Pokrivenost testovima i propusti u proveri (SR)

Stvarno zdravlje builda u ovom auditu: **typecheck 0 grešaka**, **lint 0 grešaka / 5 upozorenja**, **58/58 testova u 9 svita**. Ali te svite su **isključivo jedinični testovi čistih funkcija** (fx, stanice, događaji, faza obaveštenja, num, base64, adminMath, uuid, plan). CLAUDE.md izričito traži testove za **offline red (enqueue/flush/retry)**, **RLS (firma A ≠ B)**, i **lanac verzija `correct_trip_event`** — **nijedan ne postoji (B8, srednje)**. To je najozbiljniji procesni propust: dva najteža potvrđena nalaza (A1 regresija append-only, A4 zamrzavanje reda) leže baš u tim netestiranim delovima, a regresioni test bi uhvatio A1 još pri pisanju. **Ispravka:** (a) RLS test — vlasnikov UPDATE/DELETE na `trip_events` odbijen + admin čita 0 redova druge firme; (b) test reda — retry / poison-poruka / vezivanje za korisnika; (c) test lanca `correct_trip_event`.

## §30 — Compliance, Data Protection (GDPR) & Positioning (EN)

The product is positioned as a **"digital archive of transport documentation"** and deliberately avoids **eCMR** (legally protected; eFTI is a later phase) — respected throughout code and docs; keep it. The PRD treats **GDPR as mandatory** EU-wide. Implications: **operator↔customer separation (A2)** underpins the data-controller story — admin still reading every tenant's `trip_events` weakens the "operator can't see your operations" claim, so closing A2 is a compliance fix as much as a security one; **right to erasure** — `delete-driver-account` keeps history by design, but a full data-subject-erasure flow (storage objects + events + expenses) is not yet built; **retention** — a years-long image-retention policy + cold tier is planned, not implemented; **token-at-rest (B5)** — unencrypted refresh tokens on device should be resolved before wide EU distribution; **billing (Phase 3)** — RevenueCat per-vehicle entitlement is designed but suspension isn't server-enforced (A3) — align before monetization.

## §30 — Usklađenost, zaštita podataka (GDPR) i pozicioniranje (SR)

Proizvod je pozicioniran kao **„digitalna arhiva transportne dokumentacije"** i namerno izbegava **eCMR** (pravno zaštićen pojam; eFTI je kasnija faza) — dosledno ispoštovano u kodu i dokumentaciji; zadržati. PRD tretira **GDPR kao obavezan** u celoj EU. Posledice: **razdvajanje operator↔klijent (A2)** je temelj priče o rukovaocu podataka — to što admin i dalje čita `trip_events` svake firme slabi tvrdnju „operator ne vidi vaše poslovanje", pa je zatvaranje A2 podjednako i usklađenost i bezbednost; **pravo na brisanje** — `delete-driver-account` čuva istoriju po dizajnu, ali pun tok brisanja podataka subjekta (objekti u storage-u + događaji + troškovi) još nije napravljen; **retencija** — višegodišnja politika čuvanja slika + hladni sloj je planirana, ne i sprovedena; **tajne na uređaju (B5)** — nešifrovani refresh tokeni na uređaju treba da se reše pre šire EU distribucije; **naplata (Faza 3)** — RevenueCat entitlement po vozilu je projektovan, ali obustava nije serverski sprovedena (A3) — uskladiti pre monetizacije.

---

*Full detail, all 30 sections, and the prioritized remediation backlog: `docs/AUDIT-BRUMTRUCKERZ-2026-08.md`.*
*Pun detalj, svih 30 sekcija i prioritetna lista ispravki: `docs/AUDIT-BRUMTRUCKERZ-2026-08.md`.*
