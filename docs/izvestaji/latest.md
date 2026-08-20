# IZVEŠTAJ — F2: ŠIFARNIK ROKOVA + SERVIS PO KILOMETRAŽI (na postojeći motor podsetnika)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Migracija 0024 primenjena; `reminders-cron` redeploy-ovana na DEV. PROD/STAGING **netaknuti**.

## Izmene (spisak)
- **`supabase/migrations/0024_reminder_types_km.sql`** (novo, aditivno):
  - **`reminder_types`** (code unique, subject_kind, name_key, default_interval_months, needs_country, sort) —
    šifarnik po struci; RLS: **svi authenticated ČITAJU; nema write politike** (menja samo platforma kroz migracije).
  - **`reminders`** + `type_id` (null FK → reminder_types; **null = „prilagođen", staro ponašanje zauvek legalno**),
    `country_code` (2 slova, needs_country), `mode` (date|km, default date), `due_km` (servis po km).
- **`src/features/reminders/status.ts`** (+`.test.ts`, novo) — čiste fn: `kmStatus`/`kmRemaining` (semafor km),
  `dateSeverity`, `worstSeverity` (zajednički bedž = najgori od date/km), `proposeDateFromInterval`, `applicableKmStage`.
- **`src/features/reminders/api.ts`** — `listReminderTypes`, `createReminder`/`updateReminder` (tip/režim/km/zemlja),
  `listAllReminders` proširen (uključuje km-rokove + kilometražu vozila + `type_name_key` join).
- **`src/features/reminders/ReminderFormModal.tsx`** (novo) — „Novi rok": izbor TIPA iz šifarnika (po vrsti subjekta) +
  „Prilagođen"; tip popuni naziv i **predloži datum iz intervala** (izmenjivo); needs_country traži zemlju; za VOZILO
  izbor **Datum/Kilometraža** (due_km + „još X km"). Izmena može promeniti tip/režim; brisanje uz potvrdu.
- **`app/(owner)/reminders.tsx`** — bedž subjekta = **najgori od date+km**; km-rokovi u listi i semaforu; subject modal
  dobio „Novi rok" i „Izmeni" po redu.
- **`supabase/functions/reminders-cron/index.ts`** — km-rokovi u računanju faza (prag {2000,500,0} km), **ista poruka**
  „još X km" / „prekoračeno za X km"; deljeni `notified_stage`. Redeploy DEV.
- **`src/locales/*.json`** (svih 30) — `reminders.type.*` (12 tipova) + `mode`/`km`/`dueDate`/`dueKm`/`country`/`newTitle`/`customType`/`changeType`/`deleteConfirm`.

## Intervali (izvor: audit dokument + tržišna analiza)
| Tip | Interval | Osnova |
|---|---|---|
| CPC (Kôd 95) | 60 mes | EU Dir. 2003/59/EC — periodično usavršavanje na 5 god |
| Tahograf kartica vozača | 60 mes | kartica važi 5 god |
| ADR sertifikat vozača | 60 mes | ADR obnova na 5 god |
| Lekarsko | — (null) | interval po dobi vozača/nac. pravilima → **bez predloga** |
| Tehnički / registracija (vozilo+prikolica) | 12 mes | godišnje za teretna vozila (većina EU) |
| Kalibracija tahografa | 24 mes | EU Uredba 165/2014 — na 2 god |
| ADR vozila | 12 mes | godišnja provera |
| PP aparat | 12 mes | godišnji servis |
| Vinjeta | — (null), **needs_country** | važenje varira po zemlji/periodu |

## Km semafor (pragovi)
Iz `vehicles.current_odometer` vs `due_km`: **zeleno** > 2000 km preostalo; **žuto** ≤ 2000 km; **crveno** ≤ 500 km ili
prekoračeno. Zajednički bedž subjekta = najgori od date/km. Cron šalje na pragovima {2000, 500, 0} km (bez nove logike slanja).

## Odluke / odstupanja (CLAUDE.md pravilo 5)
1. **Nove kolone `mode`/`due_km`** (umesto reaktiviranja uspavanog `kind='mileage'`/`due_odometer` iz 0001): aplikacija
   svuda drži `kind='date'` invariant (api ga hardkodira); novi `mode` ne remeti to. Legacy kolone ostaju dormant.
2. **„Novi rok" (tip-vođen) ulaz = Rokovi → subjekt → „Novi rok"** (za subjekte sa ≥1 rokom). Početni datumski rokovi
   (registracija/PP/custom) i dalje idu i kroz Flota forme (postojeći tok). Objedinjavanje ulaza je moguća kasnija dorada.
3. **Šifarnik bez klijentskog write-a** (kao restrictions/resources, 0001) — čita svako, menja platforma migracijama.
4. Cron i `status.ts` dele km-prag logiku (paritet), kao i za datumske pragove.

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 16 suita / 116 testova (uklj. `status` — 9: km semafor/pragovi/predlog datuma/najgori-od) |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja u tuđim fajlovima) |
| `npm run test:db` | ✅ ALL PASSED (… + **reminder_types**) |

**reminder_types_test.sql:** šifarnik čitljiv SVIMA (vozač/admin vide 12 seed tipova); **klijentski write odbijen**;
reminders `type_id`/`mode`/`due_km` kolone kroz postojeću izolaciju (owner B 0; **vozač 0** — reminders je office).

## Migracije / deploy — ručna primena
- **DEV:** `0024` primenjena; `reminders-cron` redeploy.
- **STAGING / PROD:** **nije dirano.** Primena uz odobrenje: `db push` (0024 aditivno — nova tabela + 4 nullable kolone na
  reminders; postojeći rokovi netaknuti) + `functions deploy reminders-cron`.
- **HITNI SQL / rollback (DEV):** `alter table reminders drop column type_id, drop column country_code, drop column mode, drop column due_km; drop table reminder_types;`

## Jezici
i18n **dopunjen u SVIH 30 jezika** — `reminders.type.*` (12) + km/režim/forma ključevi. `sr`/`en` autorski; 28 mašinski
(status `"machine"` nepromenjen); `en` potpun (fallback). Skripta potvrdila poklapanje.

## Reverzibilnost
„Novi/Izmeni rok" kroz modal; izmena može promeniti tip/režim; brisanje uz potvrdu; predlog datuma je izmenjiv.

## Kvalitet koda
Slojevi razdvojeni (čiste fn u `status.ts`; Supabase u `reminders/api.ts`); cron ↔ status paritet; prati postojeće
obrasce (semafor, ModalScaffold/Field/DateField, React Query invalidacije). Bez duplirane logike. **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. PROD sync F2 (uz odobrenje): `db push` 0021→0024 + `functions deploy` (vies-check, reminders-cron), po receptu sa STOP-kapijama.
