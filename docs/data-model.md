# Aplikacija za praćenje tura — model podataka

Prati SQL: `supabase/migrations/0001_init.sql`. Ovaj dokument objašnjava *zašto*
je model ovakav, kako teče P&L i performans, i koje su skala-odluke ugrađene.

---

## 1. Entiteti i veze

Pet nosilaca + centralni objekat:

- **companies** — tenant (firma). Svaki drugi red nosi `company_id`.
- **app_users** — nalozi (preslikava Supabase `auth.users`), sa ulogom: `platform_admin` (ti), `owner` (vlasnik firme), `driver` (vozač).
- **vehicles** (truk), **trailers** (prikolica — ZASEBAN entitet), **drivers** (vozač kao entitet flote/HR-a, opciono vezan za app nalog preko `user_id`).
- **trips** (tura) — centralni objekat.

### Trojka truk/prikolica/vozač visi na TURI
Pošto se kombinacija menja (danas vozač A + truk 1 + prikolica 3, sutra + prikolica 5), veza `driver_id / vehicle_id / trailer_id` stoji **na `trips`**, ne na vozilu. Posledice:
- istorija je tačna — stara tura pamti kombinaciju koja je tad vozila;
- rokovi vise na svakom vozilu/prikolici/vozaču nezavisno od toga ko šta trenutno vuče;
- profit i potrošnja se režu i po vozaču i po truku i po prikolici (tura zna svo troje).
- `trailer_id` je opciono (nekad bez prikolice / zamena usput).

### Na turu se kače
- **trip_events** — dnevnik (utovar/na putu/granica/istovar…); **append-only sa verzijama** (0002): ispravka = nova verzija kroz RPC `correct_trip_event`, stara ostaje (`is_current=false`) sa ko/šta/kada + `edit_comment`. Trenutni status = poslednji događaj (denormalizovan u `trips.status`).
- **expenses** — troškovi; **multivaluta** (0002): `original_amount` + `original_currency` (kako piše na računu) + `fx_rate` + `fx_rate_date` + `base_amount`/`base_currency` (bazna valuta firme). `base = original × kurs` računa kod; kurs automatski za datum troška uz ručnu korekciju. P&L koristi `base_amount`.
- **attachments** — slike (CMR, faktura, carina…); u bazi samo ključ objekta, fajl je u object storage-u.

### Van ture
- **reminders** — rokovi, vise na `vehicle | trailer | driver`.
- **restrictions** / **resources** — globalni podaci koje održava `platform_admin`.
- **driver_month_rollup** — sažetak za izveštaje/performans.

---

## 2. Rokovi — dva tipa

- **Datumski** (`kind='date'`): registracija, tehnički, kalibracija tahografa, PP aparat (atest), izvod licence, CEMT/bilateralne, kod 95, lekarsko, ADR, zelena karta, kartica tahografa, ugovor na određeno. Cron skenira `due_date` u prozoru (npr. 30 dana) i šalje push.
- **Kilometražni** (`kind='mileage'`): servisi — „urađen na X km, sledeći na Y km". Pošto vozač unosi km po turi, `vehicles.current_odometer` se ažurira (RPC), pa app javlja kad se približi `due_odometer`. Km iz tura hrane podsetnik na servis — veza koju drugi nemaju.

Stavke su **predefinisane + „dodaj svoju"** (`category` je tekst sa poznatim vrednostima plus custom), da vlasnik ne kuca standardno, a dopuni specifično za svoju flotu bez novog build-a.

---

## 3. Uloge i privatnost (RLS + kolonska tajna)

- **Tenant izolacija:** svaki red ima `company_id`; RLS pušta vlasnika samo na svoju firmu; `platform_admin` sve.
- **Vozač NE vidi zaradu.** RLS je red-nivo, ne kolona-nivo, pa se finansije skrivaju preko **pogleda**:
  - vozač nema SELECT na baznu `trips`;
  - čita **`driver_trips`** (view bez `revenue/profit/driver_pay`), koji sam filtrira na njegove ture;
  - napreduje turu (status, završna km) preko **RPC `driver_update_trip_progress`** — nikad direktan UPDATE na `trips`, pa ne može ni slučajno da dira finansijske kolone.
- Vozač sme da dodaje **događaje / troškove / slike** samo na SVOJE ture (te tabele nemaju finansijsku tajnu — troškove ionako on unosi).
- Finansijski pogledi (`trip_pnl`, `driver_performance`) su `security_invoker=on`, pa RLS na `trips`/rollup-u automatski ograničava na vlasnika.

---

## 4. P&L ture (severna zvezda)

Sve u EUR (bazna valuta), unos po srednjem kursu. Po turi (`trip_pnl` view):

```
total_km      = end_odometer - start_odometer
expenses_total= Σ expenses.base_amount   (bazna valuta firme)
driver_pay    = naknada vozaču (unosi vlasnik: dnevnice/procenat/fiksno)
cost          = expenses_total + driver_pay
profit        = revenue - cost                 ← revenue = vozarina (unosi vlasnik)
profit_per_km = profit / total_km
consumption   = fuel_liters / total_km * 100   (okvirno; naglasiti da nije precizno)
```

Bez unosa **vozarine (revenue)** imaš samo „koliko sam potrošio", ne „koliko sam zaradio" — zato je revenue obavezno polje ture koje puni vlasnik.

---

## 5. Performans vozača — 5 metrika

Vlasnik bira po čemu rangira (padajući meni). Iz `driver_performance` (nad rollup-om):

1. **Pređeni km** — obim/iskorišćenost; duge relacije uvek vode.
2. **Broj tura** — okretnost na kratkim/čestim turama.
3. **Potrošnja goriva** (L/100km) — meri *kako* vozi; hvata i krađu goriva (outlier).
4. **Profit po km** — *pošteno*: izjednačava dugu i kratku relaciju, meri vrednost koju vozač stvara, a ne ko je dobio bogatiju turu.
5. **Ostvareno vs očekivano gorivo** — `Σ fuel / Σ (norm_consumption/100 * km)`; `<1` = bolje od norme. Izoluje veštinu vozača od tipa kamiona (svako se meri prema *svom* vozilu).

**Zamka koju treba znati:** čist „najviše novca / km" nagrađuje relaciju, ne vozača — vozači to prokljuve i demotiviše ih. Zato za nagradu (13. plata) i za prikaz vozačima podrazumevano koristi **poštene** metrike (profit/km ili potrošnja), a ne sirovi novac. Vozač vidi svoju poziciju/rang, ne tuđe apsolutne cifre.

---

## 6. Skala-odluke (za 100k vozača / 50k firmi)

Ovo je umeren OLTP, ne big data — ostaje na Postgres/Supabase. Ključno je doneti odluke koje su skupe za menjanje kasnije:

- **`company_id` na svakom redu + indeksi vođeni sa `company_id`** — svaki upit gađa jednu firmu, ne celu bazu; ujedno tenant-izolacija.
- **Particija-spremna šema** — velike tabele (`trips`, `trip_events`, `expenses`) nose `created_at`; kad narastu, particionišu se po mesecu/tenantu bez migracione muke.
- **Rollup umesto skeniranja** — dashboard/performans čitaju `driver_month_rollup`, ne sirove ture. Osvežava se po (vozač, mesec) na izmenu završene ture ili noćnim job-om (ture su uredive, pa se bucket preračunava iz baznih tabela — `refresh_driver_month`).
- **Slike van baze** — u `attachments` samo ključ; fajl u **object storage-u (preporuka Cloudflare R2 — nema egress naplate)**; kompresija na uređaju; retencija/hladni sloj za stare. Slike, ne redovi, dominiraju troškom na skali (~60M/god), pa je storage odluka najvažnija.
- **Async poslovi** — cron za rokove (skenira samo prozor + push), kompresija/thumbnail, izvoz za knjigovođu.
- **Pooling** — Edge/serverless ka Postgresu preko PgBouncer-a.

Tek kad metrika traži: veća instanca, read replika za izveštaje, stvarno particionisanje, cold storage.

---

## 7. Ostalo ugrađeno / odloženo

- **Offline-first** (vozač je van signala): lokalni red čekanja za slike/unose/status, auto-sync pri detekciji mreže. Poslednja verzija zabrana snimljena lokalno.
- **Izvoz za knjigovođu** (PDF + Excel) — vlasnikov krajnji čin; async job.
- **Zabrane** — `restrictions`, admin ubacuje kroz app, 12 meseci u krug (najstariji ispada), sa ogradom + zvaničnim EU izvorom.
- **Odloženo** (kasnije): automatska procena putarina (močvara po zemljama — u MVP-u putarina je ručni trošak), čekanje na granicama (crowdsourced), sigurni parking, pun FX po kursu.
