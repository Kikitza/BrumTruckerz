# ETNOP — MASTER PLAN (novi projektni zadatak)

> Cilj: najbolja aplikacija (mobilna + web) za male i srednje drumske prevoznike u Evropi.
> Skala-meta: arhitektura spremna za 500.000+ korisnika svih uloga.
> Ovaj dokument je jedini izvor istine za redosled rada. Menja se samo odlukom vlasnika proizvoda.

> **v1.1 (rebrand → ETNOP):** proizvod je preimenovan iz „BrumTruckerz" u **ETNOP**
> (tagline „European Transport Network Operations Platform"). Rebrand je **samo prikazni sloj**;
> tehnički/pravni identiteti (`android.package`, EAS slug, `scheme`, Supabase refs, storage ključevi,
> javni brojevi BT-D/BT-T) ostaju nepromenjeni. Istorijski dokumenti (auditi, ADR, stari izveštaji, PRD)
> se NE prepravljaju — istorija ostaje istinita.

## Ulazi u plan
1. Enterprise arhitektonski audit-dokument (ciljna arhitektura: identitet, članstvo, uloge, geografija, novac, ture, dokumenti, entitlementi, GDPR, priprema za praćenje).
2. Tržišna analiza konkurencije (kanon funkcija, e-CMR/eFTI rok 9.7.2027, AI unos naloga, compliance dubina, cenovni pritisak).
3. Odluke vlasnika proizvoda (dole, sekcija „Zaključane odluke").
4. Postojeće stanje: mobilna v1 u pravoj upotrebi (ture sa stanicama, troškovi multivaluta, dokumenti offline, rokovi, km, uloge, paketi, admin, 30 jezika, 14 migracija).

## Zaključane odluke (ne otvaraju se bez izričite odluke vlasnika)
- Vozač: ulaz telefon + SMS kod (bez lozinke); ime/prezime nisu jedinstveni; trajni javni broj (npr. BT-D-48291) vezan za nalog, ne za telefon.
- Dispečer i vozač: građani platforme — firma šalje POZIVNICU → zaposlenje sa istorijom (početak/kraj) koje preživljava promene firmi.
- Dispečer matrica: sve kao vlasnik (uklj. finansije, troškove, naloge vozača) OSIM: dispečerskih naloga i paketa firme.
- Kancelarijske uloge (vlasnik/dispečer/admin): email; promena šifre u sesiji = jedno polje + oko, bez stare šifre.
- Paketi: limit vozila = slobodan broj po firmi (1–1000+); menja samo platforma.
- Admin vidi SAMO metapodatke firmi — nikad ture/finansije (dokazano politikama).
- Dnevnik događaja ostaje append-only; završene ture zaključana dodela.
- GPS praćenje: ZAMRZNUTO do provere regulativa; kada se odmrzne — samo tokom ture, bez hardvera, adaptivno.
- Jezici: svaki novi ključ u svih 30 u istom zadatku (sr/en verified, ostali machine + en fallback).
- Reverzibilnost: Nazad u svakom čarobnjaku; Izmeni za sve sačuvano; brisanje uz potvrdu.

## Način rada (nepromenjen)
Kriška po kriška: blok → Claude Code radi → IZVESTAJ.md → pregled → test → commit.
Migracije: fajl + db push na DEV; od Faze 1: obavezna proba na STAGINGU pre PROD-a; PROD samo uz izričito odobrenje.
Svaka faza ima IZLAZNU KAPIJU koju vlasnik potpisuje.

---

## FAZA 0 — Inženjersko osiguranje (≈1 nedelja)
Cilj: pogrešiti jeftino sme, izgubiti podatke ne sme.
1. Tehnički pregled koda (audit-dokument, read-only) → docs/AUDIT-*.md + dvojezični sažetak.
2. RLS test paket: testovi direktno nad bazom koji glume vlasnika, vozača, dispečera, admina i TUĐU firmu (istorijski najskuplja klasa grešaka).
3. Staging projekat (treće okruženje; ~+10$/mes potrošnje — vlasnik odobrava pre kreiranja).
4. Backup: dokazano VRAĆANJE (restore proba u staging) — backup bez probe ne postoji.
5. docs/adr/ — 10 kratkih zapisa jednosmernih odluka: identitet, članstvo/uloge, geografija, novac, ture/stanice, dokumenti, entitlementi, GPS-priprema, e-CMR strategija, identifikatori.
KAPIJA: restore dokazan; RLS testovi u CI; ADR-ovi potpisani; nalaz pregleda pročitan i ugrađen u F1/F2 liste.

## FAZA 1 — Identitet, uloge, članstvo (≈2–3 nedelje) — jednosmerna vrata
1. Model: korisnik → profili (DriverProfile sa BT-D brojem; DispatcherProfile), ZAPOSLENJE (vozač/dispečer ↔ firma, od–do, istorija).
2. Pozivnice: firma poziva (dispečer email; vozač SMS-link ili kod firme) → prihvatanje → aktivno zaposlenje. Postojeće „vlasnik pravi nalog" ostaje kao pomoćni most.
3. Vozački ulaz telefon + SMS OTP (izbor SMS provajdera = budžetska stavka; ADR).
4. Uloga dispečer: proširenje politika ('owner' → 'owner'|'dispatcher') po zaključanoj matrici + pravljenje/brisanje kroz vlasnika.
5. Migracija postojećih podataka (prava firma, flota, vozač) bez prekida rada: staging proba → PROD uz odobrenje.
KAPIJA: sve postojeće radi kroz novi model; vozač menja broj telefona bez gubitka; RLS testovi prošireni na 5 uloga; migracija na stagingu prošla čisto.

## FAZA 2 — Razlog naplate: naručioci, fakture, compliance (≈2–3 nedelje)
1. NARUČILAC (klijent) entitet: kartoteka (naziv, PIB/VAT, kontakt, rok plaćanja), tura dobija naručioca; VIES provera PIB-a na unosu; status plaćanja po fakturi (plaćeno/kasni).
2. FAKTURA v1: tura → PDF faktura (multivaluta, numeracija po firmi, logo firme, stavke), evidencija izdatih/plaćenih.
3. COMPLIANCE ŠIFARNIK rokova (na postojeći motor rokova): CPC (35h/5god), tahograf kartica, kalibracija tahografa, ADR, vinjeta, tehnički pregled — tipovi po zemlji, podesivo; SERVIS PO KILOMETRAŽI (koristi postojeću km telemetriju iz kriške B).
4. ONBOARDING ČAROBNJAK FIRME: registracija vlasnika kroz pitanja (tipovi prevoznih sredstava — podesiva lista od kombija do cisterne; domaći/međunarodni) → aplikacija sama postavi parametre. Geografija: države kao ISO šifarnik (kraj slobodnog teksta za državu; mesto ostaje tekst uz normalizaciju).
KAPIJA: prva prava faktura izdata iz aplikacije naručiocu; šifarnik rokova pokriva ≥3 zemlje; nova firma se otvara čarobnjakom bez SQL-a.

## FAZA 3 — Web + analitika + skala (≈3–4 nedelje)
1. WEB PANEL (deljena baza i pravila): vlasnik/dispečer tabla za veliki ekran (ture, stanice, fakture, rokovi, flota) + platform-admin web.
2. ANALITIKA: l/100km, trošak/km, profit po vozilu/vozaču/naručiocu/mesecu; izvoz (XLS/PDF).
3. SKALA: listanje po stranicama svuda (server-side), indeksi po nalazu pregleda, sličice dokumenata, volume test na stagingu (≥1.000 tura, ≥50.000 događaja).
KAPIJA: dispečerov radni dan izvodljiv u browseru; volume test zelen; admin radi sa weba.

## FAZA 4 — Trkački diferencijatori (≈3–4 nedelje)
1. AI UNOS NALOGA: PDF/slika naloga → predlog ture (naručilac, stanice, cena) na potvrdu; obračun po akciji spreman za kasnije pakete.
2. e-CMR v1: strukturisan elektronski tovarni list (potpisi, statusi) + ADR-om izabrana strategija eFTI usklađenosti (sopstveno vs partner-platforma; rok 9.7.2027 diktira tempo).
3. PUSH FINALE: Firebase recept (google-services + FCM ključ na expo.dev + build + raspored 07:00) + vozačev uvid u sopstveni lekarski rok.
4. Brojač sati vožnje 561/2006 v1: ručni unos/izvedeno iz događaja → upozorenja (bez tahograf hardvera; hardver = kasnija integracija).
KAPIJA: prvi AI-unet nalog u produkciji; e-CMR pilot sa najmanje jednom firmom; push stiže na telefon.

## FAZA 5 — Ekosistem (po odluci vlasnika / regulativi)
- Integracija berze tereta (Trans.eu ili TIMOCOM API) — punjenje praznih vožnji.
- GPS v1 (odmrzavanje odlukom vlasnika): živa tačka + trag SAMO tokom ture, bez hardvera, poslednja poznata lokacija; GDPR politika + evidencija saglasnosti.
- Marketplace vozača/dispečera (identitet i istorija iz F1 su temelj).
- Automatska naplata (Stripe) kad broj firmi to opravda; iOS ($99/god) uz iPhone tražnju; rutiranje/putarine (PTV API); klijentski portal za naručioce; overe mašinskih jezika po kupcu.

## Budžetske stavke (vlasnik odobrava svaku pre nastanka)
- Supabase Pro: aktivno (25$/mes). Staging: ~+10$/mes. SMS provajder (F1): po poruci. AI unos (F4): po dokumentu. eFTI/e-CMR partner (F4): po odluci ADR-a. Apple Developer (F5): 99$/god.

## Šta plan svesno NE radi sada
Mikroservisi, sopstveni serveri, tahograf hardver, rutiranje sopstvenim snagama, 24/7 praćenje ljudi, Stripe pre tražnje — sve odbačeno uz obrazloženje „ne optimizuj teorijsku skalu na štetu isporuke" (princip iz audit-dokumenta).
