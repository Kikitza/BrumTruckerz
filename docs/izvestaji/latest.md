# IZVEŠTAJ — v2-3 kriška 1: ČLANSTVA (memberships) — temelj

> Implementacija ADR 0013 (PRIHVAĆENO 22.8.2026). Nalozi u više firmi kroz `memberships` + prekidač aktivne firme. **Sve na DEV.**

## KORAK 0
- `docs/adr/0013` i `docs/adr/0014` → **STATUS: PRIHVAĆENO** (22.8.2026, potpis vlasnika kroz savetnika).

## 1) Migracija 0034 (na DEV)
- **`memberships`** (id, user_id, company_id, role, status active|ended, created_at, ended_at) + ograničenja: **jedno aktivno članstvo po (osoba, firma)**; **najviše JEDNO aktivno VOZAČKO** članstvo po osobi (partial unique); office role smeju u više firmi.
- **`app_users.active_company_id`** — pokazivač aktivne firme.
- **BACKFILL (paritet dokazan brojevima na DEV):** app_users sa firmom = **4**, aktivnih članstava = **4**, active_company_id set = **4**, role-match = **4**, orphans = **0**. Svaki postojeći nalog = tačno jedno aktivno članstvo = današnje stanje. Stare kolone (`company_id`, `role`) OSTAJU kao fallback.

## 2) RLS „mozak" — SAMO tela helpera (nijedna politika se ne prepisuje)
- `current_company_id` / `current_role_name` / `is_office_role` sada čitaju **aktivno članstvo** (preko `active_company_id`), uz **fallback na stare kolone** ako članstva/pokazivača nema (prelazni period + kompatibilnost postojećih testova). `profile_company_id` ne postoji u kodu — nije bilo šta da se menja.
- Ključ pariteta: politike zovu iste helpere → autorizacija se menja na jednom mestu; postojeće ponašanje očuvano (fallback).

## 3) `set_active_company(company)` — prekidač (definer RPC)
- Validira da pozivalac IMA aktivno članstvo u firmi → postavi pokazivač + sinhronizuje stare kolone. Bez članstva → **`NO_ACTIVE_MEMBERSHIP` (42501)**. `my_memberships()` RPC lista firme za prekidač (definer — zaobilazi companies RLS za imena svojih firmi).

## 4) `accept_invitation` dopuna
- Prihvatanje sada **kreira ČLANSTVO** (+ sinhronizuje `active_company_id`/stare kolone; idempotentno).
- **Vozačka pozivnica** dok osoba već ima drugo aktivno vozačko članstvo → **`INVITE_DRIVER_ALREADY_ENGAGED`** (42501). **Office (dispatcher) u drugu firmu SME** (uklonjen tvrdi `INVITE_OTHER_COMPANY` blok).
- `drivers` (globalno jedinstven, 0007): ako red postoji → prebaci na firmu; inače insert (bez kršenja jedinstvenosti).

## 5) UI (nulta smetnja postojećima)
- `ActiveCompanySwitcher` u Podešavanjima: prikazan **samo uz >1 članstva** (korisnik sa jednim članstvom ne vidi ništa novo). Prebacivanje → `set_active_company` → `qc.clear()` + `reloadAppUser()` (novi globalni signal u `useSession`) + `router.replace('/')` (gate se preračuna).

## 6) Testovi
- **Nova `memberships_test.sql`** (14. svita): helper čita aktivno članstvo; **prekidač menja vidljivi svet** (A→B, izolacija: u B ne vidi Cust A); `set_active_company` bez članstva → 42501; **drugo vozačko odbijeno** (accept → 42501); **office multi dozvoljeno** (2 dispečerska članstva); **accept kreira članstvo** (nov nalog + druga firma).
- **`invitations_test` ažuriran** (namerna promena ponašanja): scenario „već član druge firme" sada je vozač-sa-članstvom → očekuje `INVITE_DRIVER_ALREADY_ENGAGED` (office multi je sad dozvoljen). Ostalih **13 svita ostalo zeleno** (dokaz da se ništa nije pomerilo — zahvaljujući fallback-u).
- **jest**: `inviteErrorKey` dopunjen (`driverAlreadyEngaged`) + test. **i18n svih 30**: `settings.activeCompany.*` (title/hint/current/role.{owner,dispatcher,driver}) + `invite.err.driverAlreadyEngaged`.

## PODSETNIK — ručna primena
- **0034 je samo na DEV.** PROD/STAGING tek uz izričito odobrenje (ritual).
- Rollback: `drop function my_memberships, set_active_company`; vrati helpere na 0020/0001 verzije; vrati `accept_invitation` na 0020 verziju; `alter table app_users drop column active_company_id`; `drop table memberships`. (Backfill je aditivan; stare kolone nikad nisu dirane.)

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 136/136 |
| `npm run test:db` (DEV) | ✅ ALL PASSED (14 svita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ exit 0 |
| Backfill paritet | ✅ 4/4, orphans 0 |
| Postojećih 13 svita zeleno | ✅ (fallback čuva staro ponašanje) |
| i18n 30/30 | ✅ |
| Kvalitet: politike NISU prepisivane | ✅ samo tela helpera |
| Link ostao na DEV | ✅ `icbjagubaftoqcwfcbwf` |
