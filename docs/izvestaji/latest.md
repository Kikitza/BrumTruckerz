# IZVEŠTAJ — v2-2: ADR 0012 „EVENT / OUTBOX SLOJ" (PREDLOG)

> Samo dokument — **kod i šema se NE diraju**. Jednosmerna vrata (⛩): traži **potpis vlasnika pre** implementacije. Putanja: `docs/adr/0012-event-outbox.md` (STATUS: **PREDLOG**).

## Predložene odluke — prostim jezikom (za potpis)
1. **Šta je događaj:** nepromenjiv zapis „desilo se" (npr. `trip.created`, `driver.assigned`, `invoice.paid`), sa `payload` i verzijom radi buduće evolucije.
2. **Outbox (temelj):** događaj se upisuje **u istoj transakciji** sa poslovnom promenom → nikad se ne gubi i nikad ne nastaje za nešto što se nije desilo. Obrada (notifikacije, marketplace) ide **kasnije, asinhrono** — razdvajamo „primi" od „obradi".
3. **Ko upisuje:** **trigeri na tabelama** kao osnova (hvataju i direktan RLS upis kao kod `trips`, i RPC upis kao kod `invoices` — pokriveni SVI putevi); samo računati eventi (`reminder.due`) emituju se eksplicitno iz cron-a.
4. **Ko troši (v1):** (a) **Supabase Realtime** → živa kancelarijska tabla bez osvežavanja; (b) **worker/cron** koji obrađuje + retry/dead-letter + retencija (čišćenje obrađenih posle ~30 dana).
5. **`audit_log` (§11):** sestrinska **trajna** tabela („ko je šta uradio"), puni je isti trigeri; outbox je prolazni red koji se čisti, audit ostaje.
6. **Šta NE radimo v1:** ne event sourcing (tabele ostaju izvor istine), ne replay infrastruktura, ne spoljni broker (Postgres dovoljan — duh ADR 0011).
7. **Put:** aditivno (`0029` tabela+RLS, `0030` trigeri), bez diranja postojećih podataka; prvi potrošač = jedna živa lista kao dokaz.

## ADR sadrži (šablon)
KONTEKST → ODLUKA (7 presuda) → ODBAČENE ALTERNATIVE (5, sa razlogom) → SKICA ŠEME (`outbox_events` + indeksi + RLS + retencija) → MIGRACIONI PUT (0029/0030) → TESTOVI ČUVARI (atomičnost, pokrivenost oba puta upisa, tenant izolacija, idempotencija, retry/dead-letter, realtime≠istina). 65 redova.

## Sledeći korak (čeka vlasnika)
- **Potpis** ovog ADR-a (STATUS → PRIHVAĆENO) je uslov za početak implementacije faze v2-2. Do potpisa se **ništa** ne menja u kodu/šemi.
- I dalje otvoreno iz ranijih kriški: primena migracija **0027 + 0028 na STAGING/PROD** (tek uz izričito odobrenje).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| Izmene u kodu/šemi | ✅ nema (samo `docs/`) |
| typecheck / test / lint | ✅ nedirano (nema promene koda) |
| i18n | ✅ nedirano (nema novih ključeva) |
| Migracije | ✅ nema (ADR je predlog, ne migracija) |
| Pravila kvaliteta | ✅ ispoštovana — dokument, bez koda; ⛩ ADR pre implementacije po pravilu 12 |
| Link ostao na DEV | ✅ |
