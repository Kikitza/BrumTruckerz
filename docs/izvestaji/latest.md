# IZVEŠTAJ — v2.0 GAP MAPA (samo dokument; kod/šema NisU dirani)

> **Napomena (činjenica):** traženi `docs/ETNOP-Senior-Projektni-Zadatak-v2.0.pdf` **NE postoji u repou** (nema nijednog
> PDF-a). Zahtev-strana je uzeta iz **spiska nabrojanog u zadatku** (v2.0 skup), stvarnost-strana iz koda (migracije
> 0001–0026, `src/features/`, Edge, `app.config`, ADR). Ako dodaš PDF — pass se pooštrava.

**Dokument:** `docs/izvestaji/V2-GAP.md` (51 redova zahteva, po oblastima, sa referencama na fajl/tabelu/migraciju).

## Skor po oblasti (✓ IMAMO / ~ DELIMIČNO / ✗ NEMA)
| Oblast | ✓ | ~ | ✗ |
|---|---|---|---|
| 1. Identitet & role | 2 | 1 | 2 |
| 2. Onboarding & OTP | 3 | – | – |
| 3. Trips & dispatch | 5 | 1 | – |
| 4. Troškovi & P&L | 3 | – | – |
| 5. Dokumenti | 2 | – | 1 |
| 6. Fleet & compliance | 4 | – | – |
| 7. Naručioci/fakture/VIES | 3 | – | – |
| 8. Offline & sync | 2 | – | – |
| 9. Notifikacije (push) | 3 | – | – |
| 10. WEB portal (moduli) | 1 | 2 | 2 |
| 11. Event/outbox sloj | – | – | 1 |
| 12. Network/marketplace | – | – | 3 |
| 13. Telematika/GPS (zamrznuto) | – | – | 1 |
| 14. Bezbednost & RLS | 2 | 1 | – |
| 15. i18n (30 jezika) | 1 | – | – |
| 16. Monetizacija | 1 | – | 1 |
| 17. Skala & observability | 2 | – | 1 |
| **UKUPNO** | **34** | **5** | **12** |

## „PREOSTALO ZA v2.0" (u dokumentu, sortirano, S/M/L + ⛩ jednosmerna vrata)
Neispunjeno (bez ponavljanja isporučenog), ključne ⛩ jednosmerne odluke: **event/outbox** (L), **role v2 + multi-firma/union**
(L), **portal podela Dispatch/Fleet/Finance/Documents/Analytics** (L), **marketplace/mrežni profil** (L), **GPS** (L, svesno
poslednje). Ostalo bez ⛩: Analytics/Reports (M), Finance modul (M), Documents modul (M), monetizacija RevenueCat (M),
Sentry (S), zatvaranje audit High A1–A4 (S–M).

## Provere
| Stavka | Rezultat |
|---|---|
| Izmene koda/šeme | **nema** (samo docs) |
| Nov fajl | `docs/izvestaji/V2-GAP.md` |
| Izvor v2.0 PDF | **nije nađen** — korišćen spisak iz zadatka (jasno naznačeno u dokumentu) |
| i18n | nije diran |
