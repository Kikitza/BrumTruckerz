# IZVEŠTAJ — v2-3 kriška 2: MREŽNI PROFIL RADNIKA (ADR 0014)

> Tanak kraj-na-kraj: **profil → pretraga → poziv → prihvatanje**. Radnik gradi vidljivost tržištu (opt-in), firma pretražuje JAVNE KARTICE bez PII i poziva kroz POSTOJEĆU kapiju (`accept_invitation`). **Sve na DEV.**

## 1) Migracija 0035 (na DEV, primenjena i verifikovana)
- **`network_profiles`** (`user_id` PK→app_users, `visibility` private|visible **default private**, `seeking_role` driver|dispatcher, `countries_of_interest text[]`, `languages text[]`, `available_from date`, `certificates jsonb` — SAMODEKLARISANO, `note`, `updated_at`). Parcijalni indeks `(visibility, seeking_role) where visibility='visible'`.
- **DATA-COLLISION GUARD (ADR 0014 §5):** `countries_of_interest` je **ODVOJENA** kolona; triger `tg_network_profiles_validate` validira ISO ⊆ `countries` (`INVALID_COUNTRY` 23514) + postavlja `updated_at`. NIKAD se ne meša sa zemljama rute/prebivališta/firme.
- **RLS `np_self`:** radnik čita/menja SAMO svoj profil (`user_id = auth.uid()`). **Office NEMA politiku** → tabelu ne čita direktno; pretraga isključivo kroz RPC.
- `invitations.target_user_id` (nova kolona) — marketplace pozivi ciljaju konkretnog korisnika (ista kapija, nov izvor).
- **RPC-ovi (SECURITY DEFINER):**
  - `network_search(role,country,language,available_only,limit,offset)` → **JAVNE KARTICE BEZ PII** (bez imena/kontakta/mejla); vraća **javni broj** (BT-D/BT-T — trajni javni identifikator po dizajnu). Samo `visibility='visible'`. Ne-office → `NOT_OFFICE` (42501). Paging.
  - `network_invite(target, role)` → ciljana pozivnica + event `marketplace.invite.sent` (handler no-op v1). Idempotentno (postojeći pending → vrati ga).
  - `my_network_invites()` → radnikovi pozivi (firma + rola + kod). `decline_network_invite(id)` → status `cancelled` (`INVITE_NOT_FOUND` 42704 ako nije njegov/pending).

## 2) Klijent — radnik (MOBILNI + WEB)
- **`src/features/network/`**: `api.ts` (jedini Supabase sloj), `searchParams.ts` (čiste fn — jest), `Tag.tsx`, `NetworkProfileEditor.tsx`, `NetworkInvites.tsx`, `NetworkSearchView.tsx`.
- **„Mrežni profil"** (`NetworkProfileEditor`): vidljivost — **jasan prekidač, PRIVATNO podrazumevano**, uz objašnjenje **šta firma vidi** kad je uključeno; sertifikati **izričito označeni „samodeklarisano"**; zemlje interesa kroz `CountryPickerField` (odvojeno), jezici iz `LANGUAGES`, `available_from` kroz `DateField`.
- **„Pozivi"** (`NetworkInvites`): firma+rola → **Prihvati** (ista kapija `accept_invitation`; v1 pravila iz 0034 — drugi aktivni vozač → jasna greška) / **Odbij** (potvrda).
- Dodato na **`app/(driver)/profile.tsx`** (radi i na webu).

## 3) Klijent — office
- **`app/(owner)/network.tsx`** („Mreža", `DesktopContainer`) + tab `tabs.network`; owner i dispečer. Filteri (uloga/zemlja/jezik/„dostupni sada") → kartice (javni broj, tražena rola, zemlje/jezici, dostupnost, samodeklarisani sertifikati, napomena) → **„Pozovi"** sa statusom „poslato / već čeka".

## 4) Vozač na WEB-u (ADR 0011 DODATAK)
- Skinuta **blanket blokada** vozača na webu. Vozač na webu dobija **lični sloj** (Profil/CV + **Mrežni profil** + **Pozivi**); gate ga na webu vodi na **Profil**. **OPERATIVA ture/km ostaje mobilna** — operativni ekran (`app/(driver)/index.tsx`) na webu prikazuje poruku „u mobilnoj aplikaciji". Jedna linija dodata u **ADR 0011**.
- **Podešavanja → „Pridruži se firmi kodom"** (reuse `AcceptInviteBox`): postojeći član ulazi u DRUGU firmu (office multi radi; vozač već angažovan → jasna greška). Po uspehu: osveži članstva + preračunaj gate.
- `marketplace.invite.sent` dobio labelu u `ActivityFeed` + `activity.event.marketplace_invite_sent` u i18n.

## 5) Testovi
- **Nova `network_test.sql` (15. svita):** privatan NEVIDLJIV / vidljiv se pojavljuje **sa javnim brojem (bez PII)**; filteri uloga/zemlja/jezik; **radnik menja SAMO svoj** (izmena tuđeg = 0 redova); **office NE čita tabelu direktno** (0 redova); ne-office `network_search` → `NOT_OFFICE`; **poziv→accept KREIRA članstvo**; **već angažovan vozač → `INVITE_DRIVER_ALREADY_ENGAGED`**. Svih **prethodnih 14 svita zeleno**.
- **jest:** `searchParams.test.ts` (`buildSearchParams` — trim/null/paginacija; `certList` — jsonb normalizacija). +6 novih testova.
- **i18n svih 30:** novi top-level `network.*` (role/profile/search/invites) + `tabs.network` + `settings.joinCompany.*` + `web.driverOperativaMobile` + `activity.event.marketplace_invite_sent`. `sr`/`en` autorski, ostalih 28 mašinski; **`en` fallback — nula MISS**; statusi fajlova nedirani.

## OBIM (namerno van ove kriške)
- Deljenje **PUNOG CV-a** preko granica firmi (uz izričit pristanak po firmi) — **kriška 3**. Office i dalje vidi SAMO CV svoje firme.

## PODSETNIK — ručna primena
- **0035 je samo na DEV.** PROD/STAGING (trenutno `0033`) i **0034** čekaju STAGING/PROD uz izričito odobrenje.
- Rollback 0035: `drop function network_search, network_invite, my_network_invites, decline_network_invite;` `alter table invitations drop column target_user_id;` `drop table network_profiles;` (aditivno; ništa postojeće nije menjano).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` (jest) | ✅ 142/142 (21 svita) |
| `npm run test:db` (DEV) | ✅ ALL PASSED (15 svita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ exit 0 |
| i18n 30/30 (en fallback, 0 MISS) | ✅ |
| Link ostao na DEV | ✅ `icbjagubaftoqcwfcbwf` |

**Kvalitet:** slojevi razdvojeni (ekrani → `features/network/api.ts`); čista logika (`searchParams.ts`) deljena i testirana; boje iz tokena, stringovi kroz `t()`; reusable `Tag`; bez dupliranja (reuse `AcceptInviteBox`, `CountryPickerField`, `PickerField`, `DateField`). Pravila ispoštovana.
