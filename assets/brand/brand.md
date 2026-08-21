# ETNOP — brand vodič (v2)

**ETNOP** = *European Transport Network Operations Platform* (tagline, ne prevodi se).
Znak: **krug sa geografski verodostojnim obrisom Evrope**, ispunjen tačkama glavnih gradova
evropskih država, povezanim tankom mrežom — „digitalna transportna mreža Evrope".

## Boje (v. i `src/lib/brand.ts` + dizajn tokeni `src/lib/theme.ts`)
| Uloga | Hex |
|---|---|
| Podloga znaka (boot/splash/ikonica) | `#0B1220` |
| Tačke/mreža — cijan (signal) | `#22D3EE` |
| Tačke — mint (prestonice) | `#5EEAD4` |

Prestonice su krupnije tačke (mint), ostali veliki gradovi sitnije (cijan); mreža je suptilna.

## Fajlovi
- `etnop-logo-europe.svg` — pun logo: krug + mapa + **ETNOP** + tagline (tamna podloga; koristi se na boot ekranu).
- `etnop-mark-europe.svg` — samo znak (krug + mapa), tamna varijanta — ikonica/splash/header/login (dark tema).
- `etnop-mark-europe-light.svg` — znak za svetlu podlogu (tamne teal tačke) — light tema, PDF faktura.

## Izvedeni PNG-ovi (iz `etnop-mark-europe.svg`, dev alat) — vezani u `app.config.ts`
- `assets/icon.png` (1024×1024, puna `#0B1220`) — app ikonica / web favicon.
- `assets/adaptive-icon.png` (1024×1024, providan, u sigurnoj zoni) — Android adaptive foreground (`backgroundColor #0B1220`).
- `assets/splash-icon.png` (providan znak) — expo-splash-screen (`backgroundColor #0B1220`).

## Izvor karte + licenca
Obris: **Natural Earth 1:110m** (public domain, slobodno za komercijalu) preko npm `world-atlas`.
Projekcija/generisanje: `d3-geo` + `topojson-client` — **samo dev alat**, NIJE runtime zavisnost aplikacije.

## Identitet ≠ brend
Tehnički/pravni identifikatori se NE menjaju rebrandom: `android.package`/`bundleId` `com.brumtruckerz.app`,
`scheme`, EAS slug/projekat, Supabase refs, storage ključevi, javni brojevi **BT-D/BT-T**.
