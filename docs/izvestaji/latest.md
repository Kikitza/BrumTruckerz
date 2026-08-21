# IZVEŠTAJ — v2.0 GAP MAPA v2 (rekoncilovano naspram PDF-a)

> **Samo dokument; kod/šema NisU dirani.** PDF je sada u repou i pročitan u celosti (28 sekcija).
> Osvežen `docs/izvestaji/V2-GAP.md` — zahtev-strana dolazi **isključivo iz PDF-a**, stvarnost-strana iz koda.

**Dokument:** `docs/izvestaji/V2-GAP.md` — 28 oblasti (po sekcijama PDF-a), svaka stavka ✓/~/✗ + referenca
(fajl/tabela/migracija), plus **Karijerni profil radnika** i **PREOSTALO ZA v2.0** (23 stavke, S/M/L, ⛩).

## Skor (ukupno kroz 28 oblasti): **60 ✓ / 34 ~ / 43 ✗**
Najgušće ✗: Driver Network (§6), Event/outbox & realtime (§8/§10), Navigation/telematika (§9), nedostajuće tabele
data modela (§10.2), Observability (§28), Export Excel/async (§7.10), Marketing agent (§15).

## Šta se PROMENILO naspram prošle (pretpostavljene) mape
- **[ISPRAVKA] Imena rola:** PDF traži tačno **`fleet_manager` / `finance_manager` / `support_readonly`** (prošli put „finance/support"). Sve tri ✗.
- **[NOVO iz PDF-a]** eksplicitni zahtevi kojih prošla mapa nije imala:
  - OTP **anti-abuse/rate-limit/recovery** + **phone-first** registracija (§5); minimalni driver profil (Code 95/ADR/jezik/država).
  - **Data collision guard** (§6) — odvojena geo polja (interes/oglas/firma/prebivalište/lokacija).
  - **`trip_assignments`** kao verzionisan entitet, **ETA** (§7.1); **`route_versions`** (§9).
  - **`maintenance_items` / `vehicle_documents` / vehicle lifecycle** (§7.5).
  - **`notifications` tabela** + tipovi (§7.11); **global search** + **`audit_log`** (§7.12/§11).
  - **`outbox_events`** + imenovani domain eventi + **realtime** (§8/§10).
  - **Cursor pagination** (§13/§17); **Sentry/observability** (§28); **GDPR tokovi** (§11); **centralni entitlement service** + metering (§16); **Marketing/growth agent** kao odvojen servis (§15).
  - Kompletna lista **nedostajućih tabela** iz §10.2 popisana.
- **Potvrđeno ✓ (nepromenjeno):** RLS/tenant izolacija, P&L view, offline red (idempotency), rokovi (datum+km), driver performance, restrictions/resources (+driver UI), i18n 30, push (F4), paket+limit vozila, canonical UUID.
- **Karijerni profil:** rani CV-prikaz moguć **odmah** iz `employments`+`trips`+`driver_month_rollup` (zaposlenje, broj/istorija tura, ukupno km, grafikon km/mesec); **„zemlje kroz koje je vozio" traži nove strukturisane podatke** (ruta→zemlja), kao i preferencije/sertifikati (§6). Bez GPS-a.

## Provere
| Stavka | Rezultat |
|---|---|
| Izmene koda/šeme | **nema** (samo docs) |
| Izvor zahteva | `docs/ETNOP_Senior_Projektni_Zadatak_v2.0 (1).pdf` (pročitan cео) |
| Osvežen dokument | `docs/izvestaji/V2-GAP.md` |
| i18n | nije diran |
