# CLAUDE.md — pravila projekta: BrumTruckerz (aplikacija za praćenje tura)

Puna specifikacija: `docs/projektni-zadatak.md` (PRD) i `docs/data-model.md`.
Ovaj fajl je sažetak pravila koja se NIKAD ne krše + redosled izgradnje.

## Šta je ovo
**BrumTruckerz** — mobilna aplikacija (Expo/React Native + Supabase) za male evropske prevoznike (1–20 kamiona):
vozač vodi turu i slika dokumentaciju; vlasnik na telefonu vidi status, troškove i **profit ture (P&L)**;
centar rokova (registracije/atesti/servisi) sa push opomenama; performans vozača.
Severna zvezda: **P&L ture**. Pozicioniranje: „digitalna arhiva transportne dokumentacije" — NIKAD ne zvati „eCMR" (pravno zaštićen pojam; eFTI sertifikacija je kasnija faza).

## Stack (zaključano)
- **Klijent:** Expo + TypeScript, Expo Router, TanStack Query, Zustand, i18next + expo-localization, expo-sqlite (offline red), EAS build/submit/update.
- **Bekend:** Supabase — Postgres + RLS, Auth, Edge Functions (Deno). Migracije = verzionisani SQL u `supabase/migrations/` (nikad ručne izmene u dashboardu).
- **Slike:** Supabase Storage — privatan bucket `prilozi`, potpisani (privremeni) URL-ovi; u bazi SAMO ključ (`attachments.storage_key`, oblik `company_id/trip_id/uuid.jpg`). Pristup kroz storage policy (migracija 0008), u duhu `attach_owner/attach_driver`. Kompresija na uređaju pre uploada. `storage_key` je backend-agnostičan → Cloudflare R2 je moguća KASNIJA optimizacija (bez migracije podataka), ne koristi se sada.
- **Push:** Expo push (tokeni u `push_tokens`). **Naplata (faza 3):** RevenueCat, pretplata po vozilu.

## Pravila koja se ne krše
1. **Tenant izolacija:** svaki tenant red nosi `company_id`; RLS uvek uključen; indeksi vođeni sa `company_id`.
2. **Vozač NE vidi finansije** (vozarina/profit/naknada): vozač NEMA select na baznu `trips` — čita view `driver_trips`; napredovanje ture ISKLJUČIVO kroz RPC `driver_update_trip_progress`. Nikad ne dodavati vozaču politiku na `trips` ili finansijske view-ove.
3. **Događaji ture su append-only:** ispravka = `correct_trip_event` RPC (nova verzija, stara ostaje sa `is_current=false`, komentar razloga). Nikad UPDATE/DELETE na `trip_events`.
4. **Multivaluta:** vozač unosi ONO ŠTO PIŠE NA RAČUNU (`original_amount` + `original_currency`); kurs (`fx_rate`, `fx_rate_date`) se povlači automatski (ECB/frankfurter, zamenjivo) uz ručnu korekciju; `base_amount = round(original*rate, 2)` računa **kod**. P&L uvek u baznoj valuti firme (`companies.base_currency`, default EUR).
5. **Matematiku računa kod**, nikad AI/model (AI funkcije su post-MVP; v. PRD).
6. **Offline-first:** sve vozačeve mutacije (događaj, trošak, progres, slika) idu kroz lokalni red (`src/lib/offline/`), nikad direktan poziv koji pada bez mreže. Red preživljava restart aplikacije.
7. **i18n:** nijedan string direktno u komponenti — sve kroz `t()` iz i18next; formati brojeva/datuma/valute kroz `src/lib/format.ts`.
8. **Teme:** boje samo iz tokena (`src/lib/theme.ts`), nikad heksadecimalno u komponenti; light + dark.
9. **Brend:** boje znaka == dizajn tokeni (`src/lib/theme.ts`); logo fajlovi i pravila u `assets/brand/brand.md`.
10. **Tajne:** nikad u repo; klijent koristi `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`; serverske tajne u Supabase secrets.
11. **Rokovi/zabrane su podatak sa izvorom, nikad AI procena.** Zabrane: 12 meseci u krug, ograda + zvanični EU izvor, lokalno keširane.
12. **Izričita zabrana ili PRESKOČI u zadatku se NIKAD ne preskače po sopstvenoj proceni** — ako misliš da je bezbedno ili korisno, **STANI i PITAJ pre izvršenja.**

## Uloge (MVP)
`platform_admin` / `owner` / `driver`. **Dispečer je ODLOŽEN** (posle validacije): vlasnik kreira do 100 dispečera sa svim owner funkcijama; vlasnik im dodeljuje vozače/kamione/prikolice; dispečeri međusobno šalju zahteve za zamenu truka/prikolice. Ne graditi sada.

## Redosled izgradnje (Faza 1 — po PRD §11)
1. ✅ Skele: repo, migracije 0001+0002, i18n, teme, offline modul (ovaj starter).
2. Auth tok: email OTP / Sign in with Apple + Google; `app_users` bootstrap; gate po ulozi (postoji skica u `app/index.tsx`).
3. CRUD flote: vozila, prikolice, vozači (owner ekrani).
4. Tura: kreiranje + dodela trojke (vozač+truk+prikolica), dnevnik događaja (insert + correct RPC), km.
5. Troškovi (multivaluta kroz offline red — postoji `features/expenses`) + slike (kompresija → offline red → Supabase Storage `prilozi` → `attachments`).
6. P&L ekran vlasnika (čita `trip_pnl`).
7. Centar rokova + `reminders-cron` Edge Function (skica postoji) + Expo push.
8. Performans (rollup okidači ili poziv `refresh_driver_month` pri završetku ture; view `driver_performance`). Vozaču SAMO operativne metrike (potrošnja vs norma, urednost, na-vreme) — profit/km isključivo vlasniku.
9. Izvoz PDF/Excel (Edge: pdf-lib + exceljs — NE Puppeteer, ne radi na Deno).
10. Zabrane/resursi (admin unos, 12 u krug, offline keš).

## Konvencije
- TypeScript strict; funkcionalne komponente; feature-first struktura (`src/features/<domen>/api.ts` je jedini sloj koji priča sa Supabase-om).
- **Ritual migracija:** svaka izmena šeme = nova migracija `NNNN_ime.sql` u repou **+** `supabase db push` na **DEV** (linkovan projekat `BrumTruckerz-dev`). Na **PROD** ide TEK uz izričito odobrenje (posebna, eksplicitna komanda vlasnika). **SQL Editor se za migracije više NE koristi** — samo za jednokratne DEV pomoćne skripte (npr. `supabase/DEV-SEED.sql`). Edge funkcije = `supabase functions deploy <ime>` (DEV; PROD uz odobrenje).
- Testovi za: offline red (enqueue/flush/retry), fx obračun, RLS (firma A ≠ firma B), correct_trip_event lanac verzija.
- **Provere na kraju svakog zadatka (ritual):** `npm run typecheck` **i** `npm test` moraju biti čisti; `npm run lint` bez **grešaka** (upozorenja su dozvoljena). Iste tri provere vrti CI (`.github/workflows/ci.yml`).
- **COMMIT-FIRST (način rada):** po završetku zadatka sa zelenim proverama — **ODMAH commit i push**. Pregled vlasnika/savetnika ide **POSLE, iz commita**; ispravke kao **novi commit** (ili revert). Ne čeka se odobrenje za commit. (Izuzetak ostaje: **PROD/STAGING migracije** i dalje samo uz izričito odobrenje — commit-first se odnosi na kod/DEV, ne na produkcionu primenu šeme.)
- **IZVEŠTAJ (obavezno):** na kraju SVAKOG zadatka upiši kompletan rezime u **`docs/izvestaji/latest.md`**, **prepisujući** stari sadržaj (uvek samo poslednji zadatak), i **COMMIT-uj ga U ISTOM commitu sa poslom** (fajl JESTE u repou, nije u `.gitignore`). Rezime obavezno sadrži: spisak izmena, test matricu (ili test listu), podsetnik za ručnu primenu migracija (ako ih ima) i eventualni HITNI SQL / rollback. **TAJNE:** u izveštaj se NIKAD ne pišu VREDNOSTI tajni (lozinke, tokeni, ključevi, connection stringovi) — samo imena/mesta; proveri i tekst koji prenosiš/citiraš. (Stari `IZVESTAJ.md` u korenu je UKINUT iz upotrebe.)

## JEZICI — važi za svaki zadatak
1. **Svaki novi i18n ključ se u ISTOM zadatku dodaje u SVE jezičke fajlove** (`src/locales/*.json`): `sr` i `en` autorski (verified), svi ostali mašinski prevod. Lista jezika je u `src/i18n/languages.ts`.
2. **`en` ostaje fallback** — nijedan ključ ne sme da postoji samo u nekom drugom jeziku a da fali u `en`.
3. **Status fajla (`"machine"`/`"verified"`) se NE menja** osim izričitim zadatkom overavanja tog jezika.
4. **Svaki izveštaj (`docs/izvestaji/latest.md`) potvrđuje** da su svi jezici dopunjeni (ili da i18n nije diran).

## REVERZIBILNOST — važi za svaki zadatak
1. **Svaki višekoračni tok ima „Nazad"** bez gubitka unosa (stanje živi u roditelju, koraci renderuju podskup).
2. **Svaki sačuvan podatak ima „Izmeni"** — forma sa postojećim vrednostima, kroz api sloj.
3. **Namerni izuzeci:** dnevnik događaja je append-only (ispravka = novi zapis kroz `correct_trip_event`); dodela na **završenim** turama je zaključana. Novi izuzeci **samo uz izričito odobrenje**.
4. **Brisanje uvek uz potvrdu** (Alert cancel/destructive).

## KVALITET KODA — važi za svaki zadatak
1. **Slojevi strogo razdvojeni:** ekrani ne zovu Supabase direktno — samo svoj feature api sloj (`src/features/<domen>/api.ts`); zajednička logika (računanje, validacija) živi u deljenim funkcijama i **NIKAD se ne duplira**.
2. **Bez špageta:** jedna funkcija = jedna odgovornost; UI koji se ponavlja se izdvaja kao reusable komponenta; fajl koji naraste da radi više nesrodnih stvari se deli (orijentir: preko ~400 linija razmisli o podeli).
3. **Imenovanje** jasno i dosledno postojećim konvencijama; **bez mrtvog koda** i zakomentarisanih blokova.
4. **Prati postojeće obrasce** projekta (React Query invalidacije, offline handleri, RPC gde postoji) umesto uvođenja paralelnih rešenja.
5. Ako zadatak traži nešto što bi ova pravila prekršilo — **ne ćuti:** uradi čistije i obrazloži u `docs/izvestaji/latest.md`, ili stani i pitaj.
6. Svaki izveštaj sadrži **jednu liniju**: potvrda da su pravila kvaliteta ispoštovana, ili šta tačno odstupa i zašto.
