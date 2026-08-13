# Projektni zadatak — Aplikacija za praćenje tura (transport / špedicija)

**Naziv:** **BrumTruckerz**
**Verzija dokumenta:** 1.2
**Status:** za razvoj (MVP)
**Povezani artefakti:** `supabase/migrations/0001_init.sql` (šema + RLS), `data-model.md` (objašnjenje modela)

---

## 1. Sažetak

Mobilna aplikacija za male i srednje transportne firme (domaći i međunarodni drumski prevoz) koja zamenjuje haos slanja dokumentacije po Viberu urednim, strukturiranim vođenjem svake ture. Vozač kroz aplikaciju otvara turu, unosi podatke i slika dokumentaciju (CMR, carinski papiri, fakture); firma u svakom trenutku ima na telefonu uvid u status ture, troškove i **zaradu po turi**. Uz to, aplikacija centralizuje praćenje rokova flote i vozača (registracije, atesti, servisi, lekarska…) i daje vlasniku pregled performansa vozača.

Proizvod je zasnovan na iskustvu iz prve ruke (međunarodna špedicija) i cilja jaz koji postojeći softver ne pokriva: postojeća rešenja su ili teški kancelarijski TMS sistemi za dispečere ili telematičke platforme sa hardverom za veće flote — jednostavna, mobilna, vozač-prva aplikacija za male firme ne postoji.

**Domet i platforme.** Proizvod cilja **evropsko tržište**, ne samo Srbiju. Distribucija kroz **App Store i Google Play**, naplata **kroz store** (po vozilu). Korisnički interfejs je **višejezičan** (spreman za sve evropske jezike, na startu upaljeno nekoliko) sa **svetlom i tamnom temom**.

---

## 2. Problem i cilj

**Problem.** Male transportne firme dokumentaciju ture vode neformalno (slike po Viberu, folderi, Excel). Posledice: gubljenje CMR-ova i računa, firma nema uvid u status ture dok ne pozove vozača, troškovi i zarada po turi se ne vide jasno, a rokovi flote (registracije, atesti, servisi) se prate ručno pa isteknu — što u EU znači kazne ili zaustavljen kamion na granici.

**Cilj.** Jedno mesto gde:
1. dokumentacija ture je uredna i dostupna (vozaču na granici, firmi u kancelariji),
2. vlasnik na telefonu vidi **trošak i zaradu svake ture** (P&L),
3. rokovi flote i vozača se prate automatski sa opomenom unapred,
4. vlasnik meri performans vozača (za stimulaciju/nagradu).

**Severna zvezda:** *P&L ture* — sve što vozač unosi sliva se u jedan broj koji vlasnik gleda: koliko je tura koštala i koliko se zaradilo.

---

## 3. Ciljni korisnici i poslovni model

**Korisnici:** transportne firme sa 1–20+ kamiona (domaći i međunarodni prevoz) — **širom Evrope**, ne samo Srbija; vlasnik/dispečer + vozači. Značajan deo vozača je istočnoevropski, pa je višejezičnost preduslov, ne dodatak.

**Kupac:** firma (vlasnik). Vozači koriste aplikaciju obavezno, kroz firmu.

**Model naplate:** mesečna pretplata **po vozilu** (simboličan iznos; tačna cifra otvorena). Fiksno-po-firmi se izbegava jer ne raste s vrednošću kod većih flota.

**Zašto je lepljivo (nizak churn):**
- Rokovi/podsetnici — jedan izbegnut istekli papir (kamion vraćen sa granice) plaća pretplatu za godine.
- Kad firmi „sednu" podaci i istorija tura u sistem, trošak prelaska je visok.
- Vrednost raste s brojem tura i vozila.

---

## 4. Uloge i prava

| Uloga | Ko | Šta radi / vidi |
|---|---|---|
| **platform_admin** | operator platforme (ti) | Sve firme (održavanje), globalne zabrane i resurse. |
| **owner** | vlasnik/dispečer firme | Sve u svojoj firmi: kreira i dodeljuje ture, unosi vozarinu/dnevnice, vodi flotu i rokove, vidi P&L i performans. |
| **driver** | vozač | Svoje ture (BEZ finansija): dnevnik/status, km, gorivo i troškovi, slike dokumenata. Vidi svoj rang. |

**Ključna privatnost:** vozač **ne sme** da vidi vozarinu, profit ni naknadu — sprovedeno na nivou baze (v. §8).

---

## 5. Funkcionalni zahtevi (MVP)

### 5.1 Ture
- Vlasnik/dispečer kreira turu i dodeljuje joj **vozača + truk + prikolicu** (prikolica opciona). Trojka se zaključava na tu turu (menja se po turi, ne fiksno na vozilu).
- Vozač beleži **dnevnik događaja** (utovar → na putu → granica → istovar…), sa vremenom i opciono mestom; trenutni status = poslednji događaj.
- **Audit trag:** vozač sme da ispravi grešku, ali stara vrednost ostaje u istoriji — ispravka je nova verzija događaja (ko/šta/kada + komentar razloga). Utovar/granica/istovar time ostaju dokazivi. Bez UPDATE/DELETE; ispravka isključivo kroz RPC.
- Vozač unosi **početnu i završnu kilometražu** (završna pri povratku u firmu → ukupni km ture).
- Vlasnik unosi **vozarinu (prihod)** i **naknadu vozaču** (dnevnice / procenat / fiksno).

### 5.2 Troškovi
- Kategorije: **gorivo** (sa litrima), **putarina**, **carina**, **špedicija**, **parking**, **ostalo**. Svi ručni unosi.
- **Multivaluta:** vozač unosi **ono što piše na računu** (originalni iznos + valuta: PLN/HUF/RON/CZK/RSD/CHF/GBP…). Sistem čuva original + kurs + datum kursa + iznos u **baznoj valuti firme** (default EUR). Kurs se povlači automatski za datum troška (ECB; zamenjiv izvor) uz mogućnost ručne korekcije; `base = original × kurs` računa kod. P&L je uvek u baznoj valuti.
- Putarina je **ručni trošak** u MVP-u (automatska procena po zemljama je odložena — v. §6).

### 5.3 Dokumentacija (slike)
- Vozač slika CMR, carinske papire, fakture, račune goriva; vezuju se za turu (ili trošak).
- Slike se **kompresuju na uređaju** pre uploada; fajl ide u object storage, u bazi je samo ključ.
- Vozaču dostupno „dokumenti pri ruci" — na granici/inspekciji izvuče papir iz aplikacije.

### 5.4 P&L ture
- Automatski: `profit = vozarina − (troškovi + naknada vozaču)`; prikaz i po km; okvirna potrošnja goriva (uz naznaku da nije precizna).

### 5.5 Centar rokova i podsetnici
- Nosioci: **vozilo** (registracija, tehnički, kalibracija tahografa, PP aparat/atest, servis), **prikolica** (registracija, atesti), **vozač** (kod 95, lekarsko, ADR, kartica tahografa, ugovor na određeno).
- Dva tipa: **datumski** (isticanje) i **kilometražni** (servis; hrani se km iz tura preko `current_odometer`).
- Stavke **predefinisane + „dodaj svoju"**.
- **Opomena push notifikacijom** unapred (podrazumevano 30 dana), preko zakazanog posla na serveru.

### 5.6 Performans vozača
- Vlasnik bira metriku (padajući meni): **pređeni km / broj tura / potrošnja goriva / profit po km / ostvareno-vs-očekivano gorivo**, za izabrani period.
- Vozaču vidljiv **rang** (podrazumevano „poštena" metrika — profit/km ili potrošnja), bez tuđih apsolutnih cifara.

### 5.7 Vozačev deo (pomoć, ne nadzor)
- **Dokumenti pri ruci** (v. 5.3).
- **Checklist pre polaska** (papiri, oprema, gorivo).
- **Resursi tab:** zabrane, brojevi policije/hitne, vulkanizeri/servisi na terenu, osnovne info o zemljama.

### 5.8 Zabrane (za kamione)
- Održava **platform_admin** (ubacuje fajl kroz aplikaciju). **12 meseci u krug** (najstariji ispada).
- Dostupno **offline** (poslednja verzija snimljena lokalno).
- **Ograda:** ne odgovaramo za tačnost; naveden **zvanični EU izvor**.
- Fajlovi zabrana nose **oznaku jezika**; za MVP zajednički jezik (engleski) uz srpski, širi se po tržištima.

### 5.9 Izvoz za knjigovođu
- Izvoz ture/perioda u **PDF i Excel** (dokumenti + troškovi), slanje fajla. Async job.

---

## 6. Van obima (v1) — svesno odloženo

- **Automatska procena putarina** po zemljama (Maut/GO-Box/DarsGo/vinjete/rovinieta…) — modeliranje osovina/emisione klase/rute je zaseban projekat; u MVP-u putarina je ručni unos.
- **Čekanje na granicama** (crowdsourced), **sigurni parking na ruti** — realan EU bol, ali teži; kasnije.
- **Lični troškovi vozača** — izbačeno (adoption rešava mandat firme; nosilo privatnost-glavobolju).
- **B2B/knjigovodstvene integracije** izvan izvoza fajla.
- **Uloga dispečera** (posle validacije aplikacije). Sačuvana specifikacija: vlasnik kreira do **100 dispečera**; dispečer ima **sve funkcije kao vlasnik**; vlasnik dispečerima **dodeljuje vozače, kamione i prikolice**; dispečeri **međusobno šalju zahteve za zamenu truka/prikolice** (tok odobravanja). MVP ostaje na vlasnik + vozači.
- **AI funkcije** (posle MVP-a; AI nikad ne računa novac niti je izvor istine za rokove/zabrane): prvo „foto računa → auto-trošak" (OCR/izvlačenje popunjava original+valutu, čovek potvrđuje — uklapa se u multivalutu), zatim čitanje CMR-a → predlog polja ture, auto-klasifikacija dokumenata, AI sažetak ture za vlasnika, prevod (višejezična flota).

---

## 7. Nefunkcionalni zahtevi

### 7.1 Skalabilnost
- Ciljevi: ~**100k vozača, 50k firmi, 100k trukova, 100k prikolica**.
- Realnost: ovo je umeren OLTP (~10M tura/god, desetine miliona redova u velikim tabelama), **nije big data**. Ostaje na Postgres/Supabase; **bez** NoSQL-a, shardinga i Kubernetes-a u startu.
- Prava skala-briga su **slike** (~60M/god, retencija godinama) — dominiraju troškom; rešava se object storage-om (v. §9), ne bazom.

### 7.2 Offline-first (kritično)
- Vozač je stalno van signala (granica, tunel, roming). Aplikacija **mora** da radi bez interneta: unos troškova/km/statusa i slikanje rade offline, u **lokalnom redu čekanja** koji se ne gubi; **auto-sync** pri detekciji mreže. Zabrane dostupne lokalno.

### 7.3 Bezbednost i privatnost
- **Multi-tenant izolacija** preko `company_id` + RLS: firma vidi samo svoje.
- **Kolonska privatnost:** vozač ne vidi finansije (sprovedeno pogledima + RPC, v. §8).
- Slike samo preko **kratkotrajno potpisanih URL-ova**; ključevi (storage, push) na serveru, nikad u klijentu.
- **GDPR obavezan** (ciljamo celu EU, ne opciono): politika privatnosti, saglasnosti, pravo na brisanje/izvoz podataka; App Store „privacy labels" i Google Data Safety popunjeni za sva tržišta.
- **Retencija:** dokumenti ture (CMR/carina) se čuvaju godinama (knjigovodstvo); definisati politiku i hladni sloj za stare.

### 7.4 Performanse
- Dashboard i performans čitaju **rollup** (`driver_month_rollup`), ne skeniraju sirove ture.
- Indeksi vođeni sa `company_id`; velike tabele particija-spremne (`created_at`).
- Ciljni odziv liste/izveštaja: < 1s na tipičnoj firmi.

### 7.5 Internacionalizacija (i18n) i lokalizacija
- **i18n od prvog reda, ne prevod na kraju.** Sav tekst kroz i18n biblioteku (`i18next` + `expo-localization`); nijedan string se ne piše direktno u kodu. Aplikacija **spremna za sve evropske jezike**; na startu upaljeno nekoliko (npr. engleski + srpski + nemački, poljski, rumunski — tržišta odakle je najviše istočnoevropskih vozača), a ostali su onda samo prevod bez ijedne izmene koda.
- **Lokalizovani formati** brojeva, datuma, kilometraže i valute po lokalu (npr. `1.234,56 €` vs `€1,234.56`). Bazna valuta ostaje **EUR** — lokalizuje se *prikaz*, ne obračun.
- **Dinamični sadržaj (zabrane/resursi) nosi jezik** — za MVP na zajedničkom jeziku (engleski) uz srpski; širi se po tržištima (polje jezika u modelu).
- Balkanska/EU realnost dokumenata (CMR, JCI/EX, EUR1, termo tiket, fito/veterinarski) i granica (Srbija van EU) ostaje pokrivena.

### 7.6 Jedinična ekonomija
- Pratiti **trošak skladištenja po firmi/vozilu** (slike su glavni trošak) — mora da stane ispod simbolične pretplate po vozilu.

### 7.7 Tematizacija (dark / light)
- **Dark i light mode preko dizajn tokena** (dve palete; komponente čitaju token, ne fiksnu boju) — postavlja se na startu jer je naknadno ušivanje bolno. Prati **sistemsko podešavanje telefona** + **ručni prebacivač**. Za vozača koji vozi noću dark mode je korisnost (manje blještanja), ne kozmetika.

---

## 8. Arhitektura

### 8.1 Klijent
- **Expo (React Native) + TypeScript** — jedan kod iOS + Android (+ web). Expo Router, **EAS Build/Submit**, **EAS Update** (OTA).
- **TanStack Query** (server state, offline keš), lagani lokalni state (Zustand).
- Offline sloj: lokalni red čekanja (mutacije + slike) sa auto-sync.
- **i18n:** `i18next` + `expo-localization` (spremno za sve evropske jezike; na startu upaljeno nekoliko); lokalizovani formati brojeva/datuma/valute.
- **Tematizacija:** dizajn tokeni za dark/light; prati sistem + ručni prebacivač.

### 8.2 Bekend
- **Supabase:** Postgres (baza), Auth (Sign in with Apple/Google + telefon OTP), Storage (potpisani linkovi), **Edge Functions** (Deno/TS) za async i orkestraciju. **RLS** od prvog dana.
- **Object storage za slike: Cloudflare R2** (bez egress naplate) — ključ u `attachments`.
- **Async poslovi:** cron za rokove (skenira prozor + push), kompresija/thumbnail, izvoz PDF/Excel.

### 8.3 Distribucija i naplata
- **Distribucija:** App Store + Google Play, globalno (evropska tržišta).
- **Naplata (kasnija faza):** **RevenueCat** nad Apple/Google IAP; pretplata **po vozilu**. Store automatski barata **valutama i porezom po zemlji kupca** — to je na globalnom nivou olakšanje, ne teret. Entitlement gate projektovati sada, aktivirati u fazi monetizacije.

### 8.4 Observability i operacije
- **Sentry** (crash/errors), **PostHog** (funnel), strukturirani logovi (bez PII u čist tekst).

### 8.5 Repo / CI/CD
- **GitHub** (+ EAS integracije); migracije kao **verzionisani SQL** u `supabase/`; trunk-based, PR provere (typecheck/lint/test); EAS profili dev/preview/prod; tajne kao secrets (ne u repo).

---

## 9. Model podataka (rezime)

Detaljno u `0001_init.sql` i `data-model.md`. Suština:

- Nosioci: **companies, app_users, vehicles, trailers, drivers**; centralni objekat **trips**.
- **Trojka truk/prikolica/vozač visi na `trips`** (menja se po turi) → tačna istorija, rezanje P&L-a po sve tri ose.
- Na turu se kače: **trip_events** (dnevnik/status), **expenses** (troškovi), **attachments** (slike; u bazi samo ključ).
- **reminders** (rokovi: datum/kilometraža; nosilac vozilo/prikolica/vozač; predefinisano + custom).
- **restrictions / resources** — globalno, admin.
- **driver_month_rollup** — sažetak za izveštaje/performans (osvežava `refresh_driver_month`).

**Privatnost (kolonska):** vozač nema SELECT na baznu `trips`; čita `driver_trips` (bez finansija) i napreduje turu preko RPC `driver_update_trip_progress` (nikad direktan UPDATE). Finansijski pogledi (`trip_pnl`, `driver_performance`) su `security_invoker=on` → RLS ograničava na vlasnika.

---

## 10. Ključne formule

**P&L ture (EUR):**
```
total_km  = end_odometer − start_odometer
cost      = Σ expenses.amount + driver_pay
profit    = revenue − cost
profit/km = profit / total_km
potrošnja = Σ fuel_liters / total_km × 100   (okvirno)
```

**Performans vozača (period):** (1) km, (2) broj tura, (3) L/100km, (4) profit/km, (5) `Σ fuel / Σ(norm/100 × km)` [<1 bolje].
*Profit i profit/km vidi **isključivo vlasnik** (vozač često ne kontroliše cenu, teret, rutu ni čekanje). Vozaču se prikazuju samo metrike pod njegovom kontrolom: ostvarena vs očekivana potrošnja, urednost dokumentacije, pravovremeno zatvaranje ture, kompletiran checklist, kašnjenja pod njegovom kontrolom.*

---

## 11. Faze isporuke

**Faza 0 — validacija (nekoliko dana).** Pokazati vlasniku uvid u turu na telefonu (status + P&L) na demo podacima; potvrditi vrednost sa 2–3 firme.

**Faza 1 — MVP jezgro.** Redosled: skele (repo + Supabase + migracija + **i18n i tema/dizajn tokeni od starta**) → baza + RLS → auth i uloge → CRUD flote (vozila/prikolice/vozači) → **tura** (kreiranje/dodela trojke, dnevnik/status, km) → **troškovi + slike (offline + upload)** → **P&L** → **centar rokova + push** → **performans** → **izvoz PDF/Excel** → **zabrane/resursi**. Lansirati sa **podskupom jezika** (ostali kasnije, samo prevod).

**Faza 2 — kaljenje.** Offline-sync edge case-ovi, kompresija/retencija slika, okidači za rollup, Sentry/PostHog, testiranje na terenu, submission na oba stora sa **lokalizovanim opisima/screenshot-ovima za glavna tržišta** i GDPR/privacy popunjeno za sva tržišta.

**Faza 3 — monetizacija.** RevenueCat po vozilu, entitlement gate, poreski/plaćanje podaci, registracija poslovanja.

---

## 12. Rizici i mitigacije

| Rizik | Mitigacija |
|---|---|
| Gubitak podataka offline (najgore mesto: granica) | Lokalni red čekanja koji preživljava; auto-sync; nikad blokirati unos zbog mreže. |
| Trošak skladištenja slika na skali | Kompresija na uređaju; R2 (bez egresa); retencija + hladni sloj; prati trošak po vozilu. |
| Netačan podatak o zabrani → kazna vozaču | Ograničiti na relevantne zemlje; datirati svaki unos; ograda + zvanični izvor; ne obećavati potpunost. |
| Rok pogrešno unet → kazna | Predefinisane stavke sa jasnim opisom; potvrda pri unosu; opomena 30 dana ranije. |
| Performans metrika demotiviše vozače | Podrazumevano poštene metrike (profit/km, potrošnja); vozač vidi rang, ne tuđe cifre. |
| „Putarinska močvara" usporava MVP | Putarina = ručni trošak; automatska procena tek kasnije, ako uopšte. |
| Skala preinženjering | Bez distribuirane arhitekture u startu; skalirati po metrici (instanca/replika/particije). |
| i18n dodat kasno (bolno ušivanje) | i18n od prvog reda (sve kroz biblioteku); lansiranje sa podskupom jezika, širenje bez koda. |
| Prevod zabrana zaostaje za jezicima UI-ja | Zabrane na zajedničkom jeziku (engleski) + srpski za MVP; jezik-polje u modelu; širenje po tržištu. |

---

## 13. Kriterijumi prihvatanja (MVP)

- Vlasnik kreira turu, dodeli trojku, unese vozarinu; vozač offline unese km/troškove/status i uslika CMR; po povratku mreže sve se sinhronizuje bez gubitka.
- P&L ture tačan (profit = vozarina − troškovi − naknada), vidljiv vlasniku; vozač **ne vidi** vozarinu/profit (proverivo pokušajem pristupa).
- Rokovi (datum i kilometraža) rade; push opomena stiže 30 dana pre isteka; km-servis reaguje na kilometražu iz tura.
- Performans daje svih 5 metrika za izabrani period; vozač vidi svoj rang.
- Izvoz ture/meseca u PDF i Excel radi.
- Zabrane: admin ubaci fajl, drži se 12 meseci u krug, dostupno offline sa ogradom/izvorom.
- Aplikacija menja **jezik** i **temu (dark/light)**; brojevi, datumi i valuta prikazani po lokalu.
- RLS: firma A ne može da pristupi podacima firme B (proverivo).

---

## 14. Otvorena pitanja

- Tačna cena pretplate po vozilu.
- Koje zemlje pokriti zabranama u prvoj verziji (prema rutama pilot-firmi).
- Da li dnevnice računati automatski iz dana u inostranstvu (iz dnevnika događaja) ili ostaviti ručni unos vlasnika u v1.
- Sa kojim jezicima lansirati (podskup) i redosled dodavanja ostalih.
- Koja tržišta (zemlje) prva u store-u.
