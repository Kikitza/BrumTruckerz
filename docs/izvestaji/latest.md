# IZVEŠTAJ — PROVERA: radnik BEZ ijedne firme i pristup „Mrežni profil"/„Pozivi"

> **Tip zadatka:** PROVERA (dijagnostika, **BEZ izmena koda/šeme/i18n**). Pitanje: nov nalog bez ijednog članstva (email registracija, nema firmu) — može li da otvori „Mrežni profil" i „Pozivi"? Kuda ga gate vodi? Ako ne — gde je prirodno mesto da radnik-bez-firme gradi profil i prima pozive.

## ODGOVOR: NE MOŽE
Nov nalog bez ijedne firme **ne može** da otvori „Mrežni profil" ni „Pozivi".

## Tačan trag gate-a (kod)
1. **Nema `app_users` reda.** Ne postoji signup triger (`on auth.users` / `handle_new_user`) — provereno u migracijama. `app_users` red nastaje ISKLJUČIVO uz firmu: `accept_invitation` (0018/0019/0034), `createCompanySelf` (0025), kreiranje dispečera (0020). Klijent nema INSERT politiku na `app_users` (samo `users_read` select) → ne može sam da napravi red.
2. **`useSession`** (`src/features/auth/useSession.ts`): `app_users.select("role").eq("id", uid).single()` → 0 redova → greška → `role = null` (fail-closed po dizajnu).
3. **`app/index.tsx`**: nije `platform_admin`, nije `owner/dispatcher/driver` → propada na **`NoRole`** ekran.
4. **`NoRole`** nudi SAMO: poruku `auth.noRole` + **`AcceptInviteBox`** (unesi kod firme) + čarobnjak „Otvori novu firmu" + Odjava. **Nema** „Mrežni profil" ni „Pozivi".

„Mrežni profil"/„Pozivi" žive na **vozačevom Profil tabu** (`app/(driver)/profile.tsx`), do koga se stiže tek kroz `CompanyGate` za rolu `driver` — a to zahteva postojeći `app_users` red **sa firmom**.

## Zabetonirano i na nivou baze
- `network_profiles.user_id` → **FK na `app_users(id)`**; a constraint **`app_users_company_by_role`** (0014) traži `company_id IS NOT NULL` za svaku ne-admin rolu.
- Zaključak: radnik **bez firme ne može ni da ima** `app_users` red → **ni `network_profiles` red**. Trenutni marketplace opslužuje samo radnika koji **već ima ili je imao** firmu (u `network_test.sql` `u_new` = vozač sa *završenim* članstvom, `company_id` postavljen). „Slobodan agent koji se nikad nije zaposlio" je arhitektonski isključen.

## Prirodno mesto (predlog, NIJE rađeno)
- **`NoRole` ekran** (prijavljen, bez firme) JESTE prirodni „welcome/onboarding" dom za **Mrežni profil editor + Pozive**.
- Uslov: **identitet koji sme da postoji bez firme**, što današnja šema zabranjuje (constraint 0014). Odluka nivoa **ADR** — dve opcije:
  - (a) omekšati `app_users_company_by_role` uz novo stanje „radnik bez firme" (nullable `company_id` za ne-admina), ili
  - (b) `network_profiles` vezati direktno za `auth.uid()` (umesto `app_users(id)`) + bootstrap laganog identiteta na `NoRole`.
- Predlog obima: zasebna tanka kriška „onboarding radnika-bez-firme", ili deo **kriške 3**.

## Izmene
- **NIJEDNA.** Bez izmena koda, migracija, i18n, testova. Ništa nije primenjeno ni na jednu bazu. Link ostaje na DEV (`icbjagubaftoqcwfcbwf`).

## i18n
- **Nije diran** (PROVERA bez izmena).

## Provere (ritual)
- Nije pokretano — read-only dijagnostika (nema promena za tipizaciju/testiranje/lint). Stanje repoa nepromenjeno u odnosu na commit `f00dff4` (v2-3 kriška 2).

**Kvalitet:** pravila ispoštovana — PROVERA je dijagnostička; zaključci potkrepljeni tačnim mestima u kodu/migracijama (bez nagađanja).
