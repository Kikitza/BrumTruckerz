# IZVEŠTAJ — MASTER-PLAN v2.0 (fazna isporuka)

> **Samo dokument; kod/šema NisU dirani.** Napisan `docs/MASTER-PLAN-v2.md` na osnovu PDF-a, `V2-GAP.md` i
> zaključanih odluka vlasnika.

**Dokument:** `docs/MASTER-PLAN-v2.md`

## Šta sadrži
1. **Gde smo** — F0–F3 isporučeno (iz koda, sa dokazima) + skor **61 ✓ / 33 ~ / 43 ✗**.
2. **Provera audit High A1–A4 → SVI ZATVORENI ✓** (utvrđeno iz koda):
   - A1 (append-only vraćen), A2 (`platform_admin` odsečen sa dnevnika), A3 (suspend RLS `company_is_active()` + restrictive write-gate) → **`0015_audit_fixes`** (+`0016`), **na PROD-u** (`remote 0026`).
   - A4 (offline poison) → `queue.ts` `MAX_ATTEMPTS=5` dead-letter, red nastavlja + `queue.test.ts`.
   - Zaključak: A1–A4 **nisu** preostali posao; nova bezbednosna stavka je `audit_log` (§11) — to je NOVO, ne A1–A4.
3. **Faze v2.0** (zaključan redosled), svaka: cilj, kriške, IZLAZNA KAPIJA, S/M/L, ⛩ + ADR-ovi pre početka:
   - **v2-1 Karijerni profil** (M, mini-⛩) → **v2-2 Event/Outbox** (L, ⛩) → **v2-3 Marketplace** (L, ⛩) → **v2-4 Komercijalizacija** (M–L, ⛩ entitlement) → **v2-Z GPS** (L, ⛩, poslednje).
4. **Faza v2-1 razrađena:** prikaz postojećih (`employments`+`trips`+`driver_month_rollup` → zaposlenja, broj/istorija tura, ukupno km, grafikon km/mesec) vs nov podatak (ruta→zemlja, uz data-collision guard); ekrani vozač/dispečer CV. Bez GPS-a.
5. **Rizici** — poštena napomena o „sve pa prodaja" (duže do prihoda/validacije) bez nametanja.
6. **Jednosmerna vrata — redosled i zašto** (event pre marketplace-a; role/multi-firma pre portala; data-collision guard pre geo podataka; entitlement pre naplate; GPS poslednje).

## Uzgred (ispravka `V2-GAP.md`)
Stavka „Zatvaranje audit High A1–A4" izbačena iz preostalog i označena ✓ (§19 red + PREOSTALO 22); skor ažuriran **60→61 ✓ / 34→33 ~**.

## Provere
| Stavka | Rezultat |
|---|---|
| Izmene koda/šeme | **nema** (samo docs) |
| Nov dokument | `docs/MASTER-PLAN-v2.md` |
| Ispravka | `docs/izvestaji/V2-GAP.md` (A1–A4 ✓) |
| A1–A4 verifikovano iz koda | ✓ zatvoreni (0015/0016 na PROD + offline dead-letter) |
