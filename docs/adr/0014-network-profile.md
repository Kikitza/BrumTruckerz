# ADR 0014 — Mrežni profil radnika (marketplace identitet)

**STATUS: PRIHVAĆENO** (22.8.2026, potpis vlasnika kroz savetnika). (Predlog: 22.8.2026.) Deo marketplace-a (v2-3); gradi na članstvu ([[0013-memberships-union-permissions]]) i event sloju (v2-2). PDF §6. Implementacija: kasnija kriška (posle članstva).

## KONTEKST (danas u kodu)
- Nalog radnika danas **nastaje samo pozivom firme** (`invitations` + `accept_invitation`, 0018/0019); radnik bez firme ne postoji u sistemu.
- Marketplace traži obrnut smer: **vozač/dispečer se sam registruje, gradi profil**, a firme ga **pretražuju i pozivaju**.
- PDF §6 traži `countries_of_interest`, `route_preferences` uz **data-collision guard**: geo polja marketinga su **ODVOJENA** od zemalja rute (v2-1b), prebivališta i firme — nikad se ne mešaju.
- `driver_profiles`/`dispatcher_profiles` (0017) već drže identitet; mrežni profil je **nadgradnja za vidljivost**, ne novi identitet.

## ODLUKA (presude + zašto)
1. **Sadržaj mrežnog profila v1:** (a) **preferencije** — `countries_of_interest[]` (ISO, zaseban skup), `route_preferences` (npr. tip ture/relacije, tekst/enum); (b) **dostupnost** — status `available|engaged` + `available_from` datum; (c) **jezici** (ISO lista); (d) **tražena rola** (`driver`/`dispatcher`); (e) **sertifikati SAMO kao samodeklarisani** (ADR/CPC/Kôd 95 kao „izjava, neprovereno" — provera je kasnija faza). Bez slobodnog CV teksta u pretrazi (CV se deli zasebno, uz pristanak — tačka 3).
2. **Privatnost — default PRIVATAN (opt-in vidljivost).** Profil je **nevidljiv** dok ga radnik izričito ne uključi (`is_listed=false` default). Kad je uključen:
   - **U pretrazi (pre kontakta)** firma vidi SAMO **javnu karticu**: tražena rola, `countries_of_interest`, dostupnost, jezici, samodeklarisani sertifikati. **NE**: ime/kontakt/prebivalište/istorija firmi.
   - **Posle kontakta** (radnik prihvati poziv / odobri) firma vidi ime + kontakt.
   - **CV (karijerni profil, v2-1) se deli ISKLJUČIVO uz izričit pristanak radnika**, po firmi, po zahtevu — nikad automatski iz pretrage. (Poštuje privatnost CV-a: self = sve firme, ostali samo uz pristanak.)
3. **Tok poziva firma→radnik = kroz POSTOJEĆI `accept_invitation`.** Marketplace poziv je **nov IZVOR** poziva (cilja postojeći mrežni-profil nalog) koji se sliva u **isti** `accept_invitation` mehanizam → koji kreira **članstvo** (ADR 0013) / zaposlenje. Jedan put pridruživanja, bez paralelnog toka. Radnik uvek **prihvata** (nema tihog dodavanja u firmu).
4. **Anti-scope v1:** BEZ plaćanja/pretplate vezane za marketplace, BEZ ocena/recenzija, BEZ chata/poruka. Samo: **registruj se → (opciono) izlistaj profil → firma pretraži → pozovi → radnik prihvati**. Komunikacija van kontakt-podataka je kasnija faza (zaseban ADR).
5. **Data-collision guard (tvrdo):** `countries_of_interest` (marketing) je **odvojena kolona** od `trip_stops.country_code`/`trips.origin_country_code` (ruta, v2-1b), od prebivališta i od firme. Nikad JOIN/merge između njih; svako polje ima svoj izvor i svoje značenje.

## ODBAČENE ALTERNATIVE (sa razlogom)
1. **Profil javan po defaultu.** Odbačeno: radnik u odnosu sa firmom ne sme da „iscuri" na tržište bez svoje odluke; privatnost je default, vidljivost je izbor.
2. **Firma vidi CV odmah iz pretrage.** Odbačeno: CV (staž, firme, km) je osetljiv; deli se samo uz izričit pristanak, inače tržište postaje nadzor.
3. **Nov, zaseban tok pridruživanja za marketplace.** Odbačeno: duplirao bi `accept_invitation` (dva puta u firmu = rizik neusklađenih dozvola). Marketplace poziv je samo nov izvor iste kapije.
4. **Ocene/chat/plaćanje u v1.** Odbačeno: veliki proizvodni i pravni obim (moderacija, spor, PSP); prvo dokazati discover→invite→accept.

## SKICA ŠEME (indikativno)
```
network_profiles (
  user_id uuid pk → app_users(id),
  seeking_role text check (seeking_role in ('driver','dispatcher')),
  is_listed boolean not null default false,          -- opt-in vidljivost
  countries_of_interest text[] default '{}',         -- ISO, ODVOJENO od rute/prebivališta
  route_preferences jsonb default '{}',
  languages text[] default '{}',
  certs jsonb default '{}',                           -- samodeklarisano, neprovereno
  availability text check (availability in ('available','engaged')) default 'available',
  available_from date,
  updated_at timestamptz default now()
)
-- Pretraga = SECURITY DEFINER RPC koji vraća SAMO javnu karticu za is_listed=true (bez PII).
-- CV deljenje = zaseban pristanak-zapis (consent) po (radnik, firma); bez njega career_* ostaje self-only.
-- RLS: radnik uređuje svoj profil; firma NEMA direktan select (samo kroz pretragu-RPC).
```

## MIGRACIONI PUT / TESTOVI ČUVARI
- Aditivno (`0037+`): `network_profiles` + pretraga-RPC + consent zapis. Bez diranja postojećih naloga.
- Testovi: (a) `is_listed=false` → nevidljiv u pretrazi; (b) pretraga vraća javnu karticu **bez** PII; (c) CV nedostupan firmi bez consent zapisa; (d) marketplace poziv završava kroz `accept_invitation` → članstvo; (e) data-collision: `countries_of_interest` nezavisan od zemalja rute.
