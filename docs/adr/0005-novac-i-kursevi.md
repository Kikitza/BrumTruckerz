# ADR 0005 — Novac i kursevi (ozvaničenje postojećeg)

## KONTEKST (danas u kodu/šemi)
- Multivaluta je već ugrađena (`0002_multicurrency_audit.sql:10-35`): `expenses` nosi `original_amount` + `original_currency` (kako piše na računu), `fx_rate` + `fx_rate_date`, i izračunato `base_amount` / `base_currency` (bazna valuta firme).
- Matematiku računa **kod**: `computeBase()` (`src/features/fx/rates.ts:28-38`) = `round2(original × rate)`, deljena i za owner-online (`expenses/api.ts`) i za offline handler (`lib/offline/handlers.ts`). Kurs: ručni override → 1 (iste valute) → `getRate` (ECB/frankfurter) za **datum troška**.
- `companies.base_currency` default `EUR` (`0001:31`); P&L (`trip_pnl`) i rollup agregiraju `base_amount`.
- Poznata rupa iz audita: **C9** — `rate == 0`/negativan nije odbijen → tiho `base_amount = 0` (`fx/rates.ts:35`).

## ODLUKA
- **Ozvaničiti postojeći model kao kanon** i zabraniti odstupanja: novac se uvek čuva kao `original(+currency)` + `rate(+date)` + izračunato `base`; **P&L isključivo u baznoj valuti firme**. Matematika ostaje u `computeBase` — nikad u modelu/klijentu slobodno (pravila #4/#5).
- Zatvoriti C9: `rate > 0` obavezno (odbaci `0`/negativ), i za automatski i za ručni override.
- **Odbačeno:** (a) čuvati samo bazni iznos — gubi „šta piše na računu" i reviziju; (b) računati kurs u bazi/triggeru — logika je već deljena u kodu i testirana; (c) live-kurs na dan prikaza — P&L mora biti stabilan po datumu troška.

## SKICA ŠEME (nacrt)
```
-- BEZ nove šeme; ozvaničenje + jedna zaštita:
expenses(original_amount, original_currency, fx_rate, fx_rate_date, base_amount, base_currency)  -- kanon
CHECK/validacija: fx_rate > 0                       -- (C9)
companies.base_currency                              -- izvor bazne valute
-- budući entiteti sa novcem (revenue ture, fakture ADR 0008) koriste ISTI obrazac
```

## MIGRACIONI PUT (bez prekida)
1. Nema restrukturiranja podataka — model već stoji u produkciji.
2. Dodati `fx_rate > 0` zaštitu (kod: `rates.ts`; opciono DB CHECK) — postojeći redovi imaju `fx_rate=1` za istoimene (`0002:22-27`), pa CHECK prolazi.
3. Staging: potvrdi da postojeći troškovi zadovoljavaju CHECK pre PROD-a.

## TESTOVI ČUVARI
- jest (`fx/rates.test.ts`, prošireno): `base = round2(original×rate)`; override precedenca; **`rate<=0` baca** (C9); iste valute → rate=1.
- test:db: `base_amount` u `trip_pnl`/rollup se ne menja bez izmene ulaza; bazna valuta = `companies.base_currency`.

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
