# IZVEŠTAJ — v2-3: DVA ADR-a ZA MARKETPLACE (PREDLOZI)

> Samo dokumenti — **kod i šema se NE diraju**. Oba ⛩ (jednosmerna vrata): traže **potpis vlasnika pre** implementacije. Putanje: `docs/adr/0013-*.md`, `docs/adr/0014-*.md` (oba STATUS: **PREDLOG**).

## ADR 0013 — Nalozi u više firmi (presude, prostim jezikom)
1. **Nova tabela `memberships`** (osoba × firma × rola) = jedini izvor „ko sme šta, sada"; `app_users` ostaje identitet + pokazivač aktivne firme; `employments` ostaje istorija/CV. (Razdvajamo „sme sada" od „radio kad".)
2. **Aktivna firma po sesiji (prekidač)**, NE „vidi sve firme odjednom" — jer ceo sistem radi u kontekstu jedne firme; prekidač je mala izmena, union bi tražio prepisivanje svih pravila.
3. **RLS se menja na JEDNOM mestu:** samo tela helpera (`current_company_id`/`current_role_name`/`is_office_role`) čitaju aktivno članstvo — **nijedna politika se ne prepisuje**.
4. **Migracija bez gubitka:** aditivno; svaki postojeći nalog dobija tačno jedno članstvo = današnje stanje; stare kolone ostaju kao fallback.
5. **v1 pravilo (pošteno):** najviše **jedno aktivno vozačko** članstvo po osobi (tura = jedna firma); **kancelarijske role smeju u više firmi**.

## ADR 0014 — Mrežni profil radnika (presude, prostim jezikom)
1. **Sadržaj v1:** preferencije (zemlje interesa — odvojene od rute; relacije), dostupnost (+datum), jezici, tražena rola, sertifikati **samodeklarisani** (neprovereno).
2. **Privatnost = PRIVATAN po defaultu** (opt-in): u pretrazi firma vidi samo **javnu karticu bez PII**; ime/kontakt tek posle radnikovog prihvatanja; **CV se deli ISKLJUČIVO uz izričit pristanak** radnika (po firmi).
3. **Poziv firma→radnik ide kroz POSTOJEĆI `accept_invitation`** (marketplace = nov izvor iste kapije → kreira članstvo iz ADR 0013); radnik uvek prihvata.
4. **Anti-scope v1:** bez plaćanja, ocena, chata — samo discover→invite→accept.
5. **Data-collision guard (tvrdo):** „zemlje interesa" su odvojena kolona od zemalja rute / prebivališta / firme — nikad se ne mešaju (PDF §6).

## Napomene
- Oba ADR-a: naš šablon (KONTEKST → ODLUKA/presude → ODBAČENE ALTERNATIVE → SKICA ŠEME → MIGRACIONI PUT/TESTOVI), srpski, ≤150 redova (39 / 48). `0014` referiše `0013` (članstvo je temelj).
- **Redosled implementacije** (ako se potpišu): prvo **0013** (članstvo — temelj dozvola), pa **0014** (mrežni profil koristi članstvo + `accept_invitation`).

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| Izmene u kodu/šemi | ✅ nema (samo `docs/adr/`) |
| typecheck / test / lint | ✅ nedirano (nema koda) |
| i18n | ✅ nedirano (nema ključeva) |
| Migracije | ✅ nema (ADR-ovi su predlozi) |
| Pravila kvaliteta / rule 12 (⛩ ADR pre implementacije) | ✅ ispoštovano |
| Link ostao na DEV | ✅ `icbjagubaftoqcwfcbwf` |
