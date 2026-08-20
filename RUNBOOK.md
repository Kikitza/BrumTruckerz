# BrumTruckerz — RUNBOOK: od zip-a do aktivne aplikacije

Prati redom. Svaka faza kaže šta radiš, gde, i kako znaš da je uspelo.

---

## Faza A — GitHub (~10 min)

1. Raspakuj `brumtruckerz-starter.zip` → dobiješ folder `fleet-app` (slobodno ga preimenuj u `brumtruckerz`).
2. Na github.com → **New repository** → ime `brumtruckerz`, **Private**, BEZ README/gitignore (repo ih već ima).
3. U terminalu, u folderu projekta:
   ```bash
   git init
   git add .
   git commit -m "BrumTruckerz starter"
   git branch -M main
   git remote add origin https://github.com/<TVOJ-NALOG>/brumtruckerz.git
   git push -u origin main
   ```
✅ Uspeh: repo na GitHub-u pokazuje 70+ fajlova, README naslov „BrumTruckerz — starter".

---

## Faza B — Supabase (~15 min)

1. supabase.com → **New project** → ime `brumtruckerz`, region **EU (Frankfurt)**, upiši i SAČUVAJ Database Password.
2. Kad se projekat digne: **Project Settings → API** → prepiši **Project URL** i **anon public** key (trebaju za `.env` u Fazi C).
3. **Migracije** — opcija 1 (CLI, preporuka; radi i iz Codespace-a):
   ```bash
   supabase login
   supabase link --project-ref <ref>    # ref = deo iz URL-a projekta
   supabase db push                     # primeni 0001 pa 0002
   ```
   Opcija 2 (bez CLI): Dashboard → **SQL Editor** → nalepi CEO sadržaj `supabase/migrations/0001_init.sql` → Run → zatim isto za `0002_multicurrency_audit.sql`.
   ✅ Uspeh: **Table Editor** pokazuje tabele (companies, trips, expenses, reminders…).
4. **Email kod (VAŽNO):** Authentication → **Email Templates → Magic Link** → u telo šablona dodaj red:
   ```
   Vaš kod za prijavu: {{ .Token }}
   ```
   Bez ovoga mejl nosi samo link, a aplikacija traži 6-cifreni kod.

---

## Faza C — Pokretanje (aktivna aplikacija na TVOM telefonu)

**Lokalno (najbrže):**
1. Preduslov: Node 20 na računaru + **Expo Go** aplikacija na telefonu (Play/App Store).
2. U folderu projekta:
   ```bash
   cp .env.example .env      # upiši Project URL i anon key iz B2
   npm install
   npx expo install --fix    # poravna verzije native paketa
   npm start
   ```
3. Skeniraj QR kod Expo Go aplikacijom (telefon i računar na istoj Wi-Fi mreži).

**Codespaces varijanta:** isto, ali umesto `npm start` koristi:
```bash
npx expo start --tunnel
```
(LAN QR ne radi iz cloud-a; prihvati instalaciju tunnel paketa kad pita.)

4. **Prva prijava:** upiši svoj email → stigne kod → upiši kod → ušao si. Videćeš praznu owner listu — normalno, još nemaš firmu ni ulogu.

5. **BOOTSTRAP (jednokratno, 2 min):** Supabase → SQL Editor:
   ```sql
   -- 1) nađi svoj user id (posle prve prijave)
   select id, email from auth.users;

   -- 2) napravi firmu (prepiši vraćeni id)
   insert into companies (name, base_currency)
   values ('Moja firma', 'EUR') returning id;

   -- 3) veži sebe kao vlasnika
   insert into app_users (id, company_id, role, full_name)
   values ('<USER-ID iz 1>', '<COMPANY-ID iz 2>', 'owner', 'Nikola');
   ```
   Restartuj aplikaciju → ulaziš kao **owner**. 🎉 Aplikacija je aktivna: telefon ↔ tvoj Supabase, prijava radi, RLS štiti podatke.

---

## Faza D — Vercel (iskrena napomena)

**Mobilna aplikacija se NE deploy-uje na Vercel** — ona živi na telefonu (sada kroz Expo, kasnije kroz EAS build → App Store / Play). Vercel ti realno treba za:
- **landing stranicu** (brumtruckerz.com) — marketing, kasnije;
- eventualni **web dashboard za vlasnike** u budućnosti (offline sloj je mobile-only, pa bi web bio zaseban, tanji klijent).

Za „aktivnu aplikaciju" danas — Vercel nije korak. Preskoči ga bez griže savesti.

---

## Faza E — Šta dalje (posle aktivne aplikacije)

1. **Codespace + Claude Code:** otvori repo u Codespace-u i zadaj: „Pročitaj CLAUDE.md i nastavi po redosledu izgradnje, korak 3 (CRUD flote)." Auth (korak 2) je već funkcionalan za email OTP; Apple/Google dugmad dodaješ pred store.
2. Gradnja ide redom iz CLAUDE.md: flota → tura → troškovi+slike → P&L → rokovi+push → performans → izvoz → zabrane.
3. **Store nalozi tek pred objavu:** Apple Developer (99 $/god), Google Play (25 $ jednokratno), EAS build/submit. Cloudflare R2 tek kad stigneš do slika (korak 5).

---

## Ako zapne (najčešće)

- **„Invalid API key" / beskonačan spinner** → proveri `.env` vrednosti pa restartuj `npm start`.
- **`supabase db push` odbija** → pogrešan `--project-ref` ili DB lozinka; `supabase link` ponovo.
- **Kod ne stiže na mejl** → proveri spam; proveri šablon iz B4 (`{{ .Token }}`); Supabase-ov ugrađeni SMTP šalje mali broj mejlova na sat (za testiranje dovoljno, za produkciju kasnije svoj SMTP).
- **QR ne radi u Codespaces** → koristi `--tunnel`.
- **Ušao sam ali sve prazno / izbacuje me** → nisi uradio Bootstrap (C5) — bez reda u `app_users` nemaš ulogu ni firmu.

---

## Onboarding — Nova firma za 2 minuta (platforma)  ⚠️ LEGACY

> **LEGACY (F2 finale):** primarni put je sada **samouslužni ČAROBNJAK** u aplikaciji —
> „Otvori novu firmu" na NoRole ekranu → `create_company_self` (0025) kreira firmu + owner +
> prazan `invoice_settings`. Vlasnik ne mora da čeka SQL. Ovaj SQL recept ostaje kao rezerva
> (npr. migracija podataka / masovni unos). **Admin tabla je nepromenjena** — platforma vidi i
> nove (samouslužne) firme i može ih suspendovati.

Recept za dodavanje NOVE firme sa vlasnikom. (Admin tabla stiže kasnije; za sada SQL.)
Fajl-šablon: **`supabase/NEW-COMPANY.sql`** (u gitu, bez tajni).

1. **Auth user vlasnika** — Supabase Dashboard **ciljne baze** (DEV ili PROD) → **Authentication → Users → Add user**: unesi **email vlasnika** + lozinku, uključi **Auto Confirm User**. Kopiraj **UUID** novog korisnika.
2. **Popuni šablon** — otvori `supabase/NEW-COMPANY.sql`, zameni placeholdere:
   - `<IME_FIRME>` (npr. `Prevoz Marković d.o.o.`), `<BAZNA_VALUTA>` (`EUR`/`RSD`…), `<PLAN>` (`starter`/`pro`), `<LIMIT>` (npr. `5`), `<OWNER_AUTH_ID>` (UUID iz koraka 1).
3. **Run** — Dashboard → **SQL Editor** (ista, ciljna baza) → nalepi popunjen sadržaj → **Run**. Kontrolni `SELECT` na dnu mora vratiti **1 red** (firma + owner). Idempotentno: ponovni Run kad owner već ima nalog → ne pravi duplu firmu.
4. **Vlasnik se prijavi** u aplikaciji (email + lozinka iz koraka 1). Vidi **praznu** firmu (tenant izolacija — ništa tuđe).
5. **Dalje radi sam:** vozače pravi kroz **Flota → vozač → „Napravi nalog"** (kriška P1); vozila/prikolice unosi sam — **limit paketa čuva bazni trigger** (0013), preko limita dobija ljubaznu poruku.

> Promena paketa/limita je isključivo platformska:
> `update companies set plan='pro', vehicle_limit=20 where id='<company_id>';` (vlasnik to ne može kroz app — RLS).

---

## Platform admin (platforma)

Nalog platform administratora (naplata/paketi/status firmi) pravi **isključivo platforma, ručno**.

**Kreiranje:**
1. Dashboard **ciljne baze** → Authentication → Users → Add user: **jaka lozinka**, Auto Confirm. Kopiraj UUID.
2. SQL Editor iste baze:
   ```sql
   insert into public.app_users (id, role, company_id)
   values ('<ADMIN_AUTH_ID>', 'platform_admin', null);   -- company_id MORA biti null (check u 0014)
   ```
3. Prijava tim nalogom → aplikacija otvara **admin sekciju** (lista firmi).

**Šta admin može:** vidi sve firme (ime, paket, X/N vozila, status, plaćeno-do, vlasnikov email) + ukupne brojke platforme; menja **paket + limit vozila** i **status (aktivna/obustavljena) + plaćeno-do + napomenu**. Sve kroz RPC (`admin_*`), uz proveru role u bazi.

**Šta admin NE može:** poslovni/finansijski sadržaj firmi (ture, troškovi, P&L) — RLS mu je zatvoren (0014).

**Suspenzija:** status `suspended` → pri prijavi owner **i** vozač te firme dobijaju ekran „Nalog je privremeno obustavljen". (Tvrdo RLS zaključavanje podataka pri suspenziji = buduća opcija.)

---

## Restore proba (dokazano vraćanje backupa) — ponovljivo za ~10 min

Cilj: dokazati da PROD backup može da se **vrati** u zaseban projekat (`BrumTruckerz-staging`),
tj. da backup nije samo fajl nego proverena kopija. „Backup bez probe ne postoji" (ADR F0).
Metod: native `pg_dump`/`pg_restore` (PG17) preko **IPv4 poolera** — bez Docker-a.
*(Prvi put dokazano 19.8.2026: svih 13 tabela PROD == STAGING.)*

> STAGING = kopija PRAVE baze (pravi podaci). Lozinke NE upisivati u repo/`.env`; drži ih samo u
> sesiji (env/fajl van repo-a, `chmod 600`), i **obriši (`shred`) posle probe** — dump sadrži PII.

**Preduslovi (jednom):**
- Postgres klijent **17**: `sudo apt-get install -y postgresql-client-17` (PGDG repo). `pg_dump 16` ODBIJA PG17 server.
- Supabase CLI ulogovan (`supabase login`), Pro org (`--org-id` iz `supabase orgs list`).
- **Direktni host `db.<ref>.supabase.co` je IPv6-only** → sa IPv4 runnera koristi **pooler**
  (`aws-N-<region>.pooler.supabase.com`, user `postgres.<ref>`). Tačan `aws-N` prefiks saznaj sa:
  `supabase link --project-ref <ref> -p <pw>` pa `supabase db dump --linked --dry-run | grep PGHOST`.

**Koraci:**
1. **Kreiraj staging** (isti region kao PROD = `eu-west-1`); lozinku generiši, nigde ne commituj:
   ```bash
   STG_PW=$(openssl rand -hex 24)
   supabase projects create BrumTruckerz-staging --org-id <ORG_ID> --region eu-west-1 --db-password "$STG_PW" --yes
   ```
2. **PROD DB lozinka** — reset na **PRAVOM** projektu: Dashboard URL mora sadržati **PROD ref**
   (`https://supabase.com/dashboard/project/<PROD_REF>/settings/database` → Reset). *Čest zastoj:
   reset se slučajno odradi na staging/dev projektu — proveri ref u URL-u!*
   ```bash
   export PGPASSWORD='<PROD_DB_PW>'; PH=aws-1-eu-west-1.pooler.supabase.com; PU=postgres.<PROD_REF>
   ```
3. **Dump PROD** — `public` (šema+podaci) + `auth.users` (podaci; potreban zbog FK `app_users→auth.users`):
   ```bash
   pg_dump -h $PH -U $PU -d postgres --schema=public --no-owner --no-privileges -Fc -f public.dump
   pg_dump -h $PH -U $PU -d postgres -t auth.users --data-only -Fc -f authusers.dump
   ```
4. **Restore u staging** — PRVO `auth.users` (da FK ciljevi postoje), pa `public`:
   ```bash
   export PGPASSWORD="$STG_PW"; SH=aws-1-eu-west-1.pooler.supabase.com; SU=postgres.<STG_REF>
   pg_restore -h $SH -U $SU -d postgres --no-owner --data-only authusers.dump
   pg_restore -h $SH -U $SU -d postgres --no-owner --no-privileges public.dump
   ```
   > Jedina očekivana greška: `schema "public" already exists` (postoji u svežem projektu) — bezopasno.
   > Alternativa (Dashboard, bez klijenta): PROD → *Database → Backups* vraća **u ISTI** projekat (PITR);
   > za **poseban** projekat ide gornji `pg_dump|pg_restore`.
5. **Dokaz poklapanja** — isti upit na obe baze; brojevi moraju biti isti:
   ```bash
   Q="select 'companies',count(*) from companies union all select 'app_users',count(*) from app_users
      union all select 'vehicles',count(*) from vehicles union all select 'trailers',count(*) from trailers
      union all select 'drivers',count(*) from drivers union all select 'trips',count(*) from trips
      union all select 'trip_events',count(*) from trip_events union all select 'trip_stops',count(*) from trip_stops
      union all select 'expenses',count(*) from expenses union all select 'attachments',count(*) from attachments
      union all select 'reminders',count(*) from reminders union all select 'auth.users',count(*) from auth.users order by 1;"
   PGPASSWORD='<PROD_DB_PW>' psql -h $PH -U $PU -d postgres -Atc "$Q"   # == PROD ==
   PGPASSWORD="$STG_PW"     psql -h $SH -U $SU -d postgres -Atc "$Q"    # == STAGING ==
   ```
   Upiši obe kolone u `IZVESTAJ.md` (tabela PROD vs STAGING).
6. **OBAVEZNO vrati link na DEV** (staging je samo za probu):
   ```bash
   supabase link --project-ref icbjagubaftoqcwfcbwf   # BrumTruckerz-dev
   supabase projects list                             # potvrda: DEV = linked
   ```
7. **Higijena:** `shred -u public.dump authusers.dump` i fajl(ove) sa lozinkama; posle dokazane
   probe **resetuj PROD DB lozinku** (bila je u sesiji) i obriši/ugasi staging ako ne treba (troškovi).

**Higijena:** admin nalog je SAMO za platformu (ne vezuj ga za firmu); jaka lozinka; ne deli ga.

## Aktivacija SMS-a na produkciji (SAMO ZAPIS — ne primenjuje se u test režimu)

> DEV je u **TEST režimu**: `external_phone_enabled=true`, `sms_provider=twilio` **bez kredencijala**,
> `sms_test_otp` sadrži fiksne test brojeve → kod stiže samo za te brojeve, **ništa se stvarno ne šalje, nula troška**.
> Pravi SMS se pali **tek na produkcijskom lansiranju**, uz izričito odobrenje vlasnika. Koraci:

1. **Twilio Verify nalog** (preporuka: Verify, ne obični Messaging — Twilio drži OTP/rate/retry):
   - kreiraj Twilio nalog → **Verify Service** → uzmi `Account SID`, `Auth Token`, `Verify Service SID`.
2. **Unesi kredencijale na PROD projektu** (Dashboard → Authentication → Providers → Phone → *Twilio Verify*),
   ili kroz Management API `PATCH /v1/projects/<PROD_REF>/config/auth`:
   `sms_provider=twilio_verify`, `sms_twilio_verify_account_sid`, `sms_twilio_verify_auth_token`,
   `sms_twilio_verify_message_service_sid`.
3. **ISKLJUČI test brojeve** na PRODU: `sms_test_otp=""` i `sms_test_otp_valid_until=null`
   (inače bi fiksni kodovi radili i na produkciji — bezbednosna rupa).
4. **Rate limits**: `rate_limit_sms_sent` (SMS/sat po projektu) i `sms_max_frequency` (min. razmak između
   dva slanja istom broju) — postavi razumno (npr. 5–10/sat po broju) da se spreči zloupotreba/trošak.
5. **CAPTCHA / Attestation**: uključi CAPTCHA na Auth (Dashboard → Authentication → Attack Protection),
   da botovi ne pale SMS troškove (Turnstile/hCaptcha; klijent šalje `captchaToken` uz `signInWithOtp`).
6. **Provera pre puštanja**: pošalji na SVOJ pravi broj jednom, potvrdi da OTP stiže i da verifikacija radi;
   pa proveri da test brojevi VIŠE ne prolaze (korak 3).

**Rollback SMS-a** (ako zatreba): `external_phone_enabled=false` — telefon nestaje sa login ekrana (klijent
gate-uje po grešci), email/lozinka ostaje.
