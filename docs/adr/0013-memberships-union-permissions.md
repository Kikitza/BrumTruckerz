# ADR 0013 — Nalozi u više firmi (membership + union dozvole)

**STATUS: PREDLOG** (22.8.2026). Jednosmerna vrata (⛩) — vlasnik potpisuje **pre** implementacije. Temelj marketplace-a (v2-3), gradi na event sloju (v2-2). PDF §4.

## KONTEKST (danas u kodu)
- `app_users` = **1 nalog → 1 firma → 1 rola** (`company_id`, `role`). Svi RLS helperi zavise od toga: `current_company_id()`, `current_role_name()`, `is_office_role()` čitaju taj JEDAN red.
- `employments` (0017) već čuva **istoriju kroz firme** (started/ended, status) — koristi je karijerni profil (v2-1). To je HR/istorija, NE tekuća autorizacija.
- `drivers.user_id` je **globalno jedinstven** (0007): jedna osoba = jedan drivers red; istorija po firmama živi na `trips.company_id`/rollup.
- Marketplace traži da radnik kroz vreme ima odnose sa **više firmi**, a PDF §4 najavljuje i buduće role (`fleet`, `finance`, `support`) — model „jedna rola po nalogu" ne nosi to.

## ODLUKA (presude + zašto)
1. **Model članstva = NOVA tabela `memberships`** (ne evolucija `app_users`). `memberships(user_id, company_id, role, status)` je **jedini izvor tekuće autorizacije** (ko sme šta, u kojoj firmi, sada). `app_users` ostaje **bootstrap identiteta** (1 red po auth nalogu) + pokazivač `active_company_id`. `employments` ostaje **HR/istorija** (datumi, za CV). Zašto odvojeno: authz-sada i istorija-kroz-vreme su različite stvari; spajanje bi zaključalo CV logiku u dozvole.
2. **Aktivna firma po sesiji (prekidač), NE union pogled.** Ceo sistem pretpostavlja JEDAN kontekst firme (`current_company_id()`). Radnik/kancelarija bira **aktivnu firmu**; sve se dešava u njenom kontekstu. Union („vidi sve firme odjednom") bi tražio prepisivanje SVAKE politike → odbačeno za v1 (v. alternative).
3. **RLS helperi se menjaju BEZ diranja politika:** redefinišu se SAMO tela `current_company_id()`/`current_role_name()`/`is_office_role()` (iste signature) da čitaju **aktivan `memberships` red** umesto `app_users`. Pošto sve politike zovu te helpere, autorizacija se menja **na jednom mestu** — nijedna `create policy` se ne prepisuje.
4. **Migracioni put (bez gubitka):** aditivno. `0035`: `create table memberships`; **backfill** jedan red po postojećem `app_users(user, company_id, role)`; `app_users.active_company_id` default = ta firma. `0036`: redefinicija helpera na memberships+active. Stare kolone `app_users.company_id/role` ostaju (deprecated, čitaju se kao fallback dok se ne uklone kasnijom migracijom). Postojeći nalozi rade neprekidno.
5. **Šta v1 NE radi — pošteno pravilo:** **najviše JEDNO aktivno vozačko članstvo** po osobi (kao `drivers.user_id` jedinstvenost + „jedno aktivno zaposlenje" 0017): tura vezuje vozača za operativu jedne firme, dva istovremena aktivna vozačka odnosa nemaju operativni smisao. **Kancelarijske role (owner/dispatcher) SMEJU biti višestruke** (neko poseduje/dispečuje za više firmi). Prebacivanje vozača u drugu firmu = zatvori staro članstvo, otvori novo (istorija ostaje u `employments`).

## ODBAČENE ALTERNATIVE (sa razlogom)
1. **Evolucija `app_users` (dodati mu više redova / niz firmi).** Odbačeno: `app_users.id = auth.uid()` je PK (jedan red po nalogu); rušenje toga dira Auth bootstrap i svaki `= auth.uid()` upit. Članstvo je zaseban odnos → zaseban entitet.
2. **Union dozvole (radnik vidi sve svoje firme istovremeno).** Odbačeno za v1: svaka politika i indeks vođeni su sa `company_id`; union traži prepisivanje svih politika + rešavanje „u kojoj firmi je ovaj upis" na svakom ekranu. Ogroman rizik. Prekidač aktivne firme daje 95% vrednosti uz malu izmenu (helperi).
3. **`memberships` = `employments`.** Odbačeno: `employments` nema owner-a (vlasnik nije „zaposlen"), ima datume/CV semantiku; miksovanje authz-sada sa istorijom pravi dvosmislenost. Sestrinske tabele, jasne uloge.
4. **Više istovremenih aktivnih vozačkih članstava.** Odbačeno za v1: nema operativnog smisla (jedna tura = jedna firma); kasnije, ako zatreba (npr. ispomoć), zaseban ADR.

## SKICA ŠEME (indikativno)
```
memberships (
  id uuid pk, user_id uuid → app_users(id), company_id uuid → companies(id),
  role user_role not null, status text check (status in ('active','revoked')) default 'active',
  created_at timestamptz default now(), revoked_at timestamptz,
  unique (user_id, company_id)                       -- jedan odnos po (osoba, firma)
)
partial unique index: (user_id) where role='driver' and status='active'   -- jedno aktivno vozačko članstvo
-- app_users += active_company_id uuid → companies(id)  (default = jedina firma pri backfill-u)
-- RLS: memberships čita se preko helpera (SECURITY DEFINER); menjaju je owner/office kroz RPC (kao employments).
```

## MIGRACIONI PUT / TESTOVI ČUVARI
- Aditivno (`0035` tabela+backfill, `0036` helperi). Bez gubitka: svaki postojeći nalog dobija tačno jedno članstvo = današnje stanje.
- Testovi: (a) posle backfill-a svaki `app_users` ima 1 aktivno članstvo i isti `current_company_id()` kao pre; (b) prekidač aktivne firme menja `current_role_name()`/izolaciju; (c) tenant izolacija i dalje važi (firma A ≠ B) kroz nove helpere; (d) partial unique blokira drugo aktivno vozačko članstvo.
