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
- **Slike:** Cloudflare R2 preko potpisanih URL-ova iz Edge Function; u bazi SAMO ključ (`attachments.storage_key`). Kompresija na uređaju pre uploada.
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

## Uloge (MVP)
`platform_admin` / `owner` / `driver`. **Dispečer je ODLOŽEN** (posle validacije): vlasnik kreira do 100 dispečera sa svim owner funkcijama; vlasnik im dodeljuje vozače/kamione/prikolice; dispečeri međusobno šalju zahteve za zamenu truka/prikolice. Ne graditi sada.

## Redosled izgradnje (Faza 1 — po PRD §11)
1. ✅ Skele: repo, migracije 0001+0002, i18n, teme, offline modul (ovaj starter).
2. Auth tok: email OTP / Sign in with Apple + Google; `app_users` bootstrap; gate po ulozi (postoji skica u `app/index.tsx`).
3. CRUD flote: vozila, prikolice, vozači (owner ekrani).
4. Tura: kreiranje + dodela trojke (vozač+truk+prikolica), dnevnik događaja (insert + correct RPC), km.
5. Troškovi (multivaluta kroz offline red — postoji `features/expenses`) + slike (kompresija → potpisani URL → R2 → `attachments`).
6. P&L ekran vlasnika (čita `trip_pnl`).
7. Centar rokova + `reminders-cron` Edge Function (skica postoji) + Expo push.
8. Performans (rollup okidači ili poziv `refresh_driver_month` pri završetku ture; view `driver_performance`). Vozaču SAMO operativne metrike (potrošnja vs norma, urednost, na-vreme) — profit/km isključivo vlasniku.
9. Izvoz PDF/Excel (Edge: pdf-lib + exceljs — NE Puppeteer, ne radi na Deno).
10. Zabrane/resursi (admin unos, 12 u krug, offline keš).

## Konvencije
- TypeScript strict; funkcionalne komponente; feature-first struktura (`src/features/<domen>/api.ts` je jedini sloj koji priča sa Supabase-om).
- Svaka izmena šeme = nova migracija `NNNN_ime.sql`.
- Testovi za: offline red (enqueue/flush/retry), fx obračun, RLS (firma A ≠ firma B), correct_trip_event lanac verzija.
- **Provere na kraju svakog zadatka (ritual):** `npm run typecheck` **i** `npm test` moraju biti čisti; `npm run lint` bez **grešaka** (upozorenja su dozvoljena). Iste tri provere vrti CI (`.github/workflows/ci.yml`).
- **IZVEŠTAJ (obavezno):** na kraju SVAKOG zadatka upiši kompletan rezime u `IZVESTAJ.md` u korenu projekta, **prepisujući** stari sadržaj (uvek samo poslednji zadatak). Rezime obavezno sadrži: spisak izmena, test matricu (ili test listu), podsetnik za ručnu primenu migracija (ako ih ima) i eventualni HITNI SQL / rollback. `IZVESTAJ.md` je u `.gitignore` (ne commituje se) — služi da preživi reset sesije/Codespace-a.

## KVALITET KODA — važi za svaki zadatak
1. **Slojevi strogo razdvojeni:** ekrani ne zovu Supabase direktno — samo svoj feature api sloj (`src/features/<domen>/api.ts`); zajednička logika (računanje, validacija) živi u deljenim funkcijama i **NIKAD se ne duplira**.
2. **Bez špageta:** jedna funkcija = jedna odgovornost; UI koji se ponavlja se izdvaja kao reusable komponenta; fajl koji naraste da radi više nesrodnih stvari se deli (orijentir: preko ~400 linija razmisli o podeli).
3. **Imenovanje** jasno i dosledno postojećim konvencijama; **bez mrtvog koda** i zakomentarisanih blokova.
4. **Prati postojeće obrasce** projekta (React Query invalidacije, offline handleri, RPC gde postoji) umesto uvođenja paralelnih rešenja.
5. Ako zadatak traži nešto što bi ova pravila prekršilo — **ne ćuti:** uradi čistije i obrazloži u `IZVESTAJ.md`, ili stani i pitaj.
6. Svaki `IZVESTAJ.md` sadrži **jednu liniju**: potvrda da su pravila kvaliteta ispoštovana, ili šta tačno odstupa i zašto.
