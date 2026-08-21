# IZVEŠTAJ — ETNOP LOGO „EVROPA DOT-MAP" (samo grafika u repou; app NIJE diran)

> DEV. Novi znak = krug sa geografski verodostojnim obrisom Evrope, ispunjen tačkama glavnih gradova,
> povezanim tankom mrežom. Ovaj logo **zamenjuje** dosadašnji kamion. **Aplikacija se NE dira** (bez
> login/splash/app.config izmena) — napravljeni su i commit-ovani samo asset fajlovi.

## Izvor karte + licenca
- **Granice:** **Natural Earth** (1:110m admin-0 countries) — **public domain** (slobodno za komercijalnu upotrebu, bez atribucije).
- **Dostava:** npm paket **`world-atlas@2`** (`countries-110m.json`, TopoJSON izveden iz Natural Earth). 110m rezolucija je već generalizovana → čisto na maloj veličini.
- **Bez plaćenih/zatvorenih zavisnosti.**

## Alat (DEV-ONLY — NIJE runtime zavisnost aplikacije)
Konverzija/projekcija radi se **samo u dev-u**, van `package.json` aplikacije (analogno kao Deno Edge kod):
- `d3-geo@3` — `geoMercator` projekcija; `geoPath` → SVG putanja.
- `topojson-client@3` — `topojson.merge(...)` spaja kurirane evropske države u **jedinstvenu siluetu bez unutrašnjih granica**.
- Prekomorske teritorije (Fr. Gvajana, Azori, Kanari, Svalbard…) se odbacuju filtrom po lon/lat okviru + `clipExtent`.
- **Reprodukcija:** u praznom folderu `npm i d3-geo@3 topojson-client@3 world-atlas@2`, pa generator skripta (Mercator `fitExtent` na kurirani skup ~38 država, projekcija gradova istom projekcijom, mreža = najbliži susedi prag 42px/max 3 po čvoru). Generator se **ne commit-uje** (uvezao bi `d3-geo` koji nije app-dep → lint bi pao; svrha je čist repo bez runtime zavisnosti).

## Tačke (gradovi)
- **36 gradova**: **30 prestonica** (krupnije tačke, mint `#5EEAD4`) + **6 najvećih gradova** (sitnije, cijan `#22D3EE`): Barcelona, Milano, Minhen, Hamburg, Napulj, Porto.
- Prestonice: Lisabon, Madrid, Pariz, Dablin, London, Brisel, Amsterdam, Berlin, Beč, Rim, Kopenhagen, Oslo, Stokholm, Helsinki, Varšava, Prag, Budimpešta, Zagreb, Beograd, Sarajevo, Tirana, Atina, Sofija, Bukurešt, Kijev, Minsk, Vilnjus, Riga, Talin, Rejkjavik.
- Sve tačke projektovane **istom d3-geo projekcijom** kao obris (lat/lon → x,y).
- **Mreža:** 49 linija (suptilno, prag 42px, maks. 3 najbliža suseda po čvoru — čitljivo, bez guste kaše).

## Stil
Tamna podloga `#0B1220`, dvostruki ring (cijan, nizak opacitet), suptilna kontura kontinenta, tačke/mreža cijan `#22D3EE` + mint `#5EEAD4`. Čisto, minimalističko, enterprise. Vizuelno provereno rasterizacijom (Evropa prepoznatljiva: Iberija, Britanska ostrva, Skandinavija, Italija, Balkan, Island).

## Izlazni fajlovi (`assets/brand/`)
| Fajl | Sadržaj | Namena | Veličina |
|---|---|---|---|
| `etnop-logo-europe.svg` | krug + mapa + **„ETNOP"** + tagline | pun logo (300×400) | ~16 KB |
| `etnop-mark-europe.svg` | samo krug + mapa (bez teksta) | ikonica / splash / boot (300×300) | ~16 KB |
| `etnop-mark-europe-light.svg` | isto, **svetla podloga + tamne teal tačke** | svetle površine | ~16 KB |

- **Čist, ručno-čitljiv vektor** — obris je pravi geo `path` (koordinate zaokružene na 1 decimalu), **bez ijedne embed rasterizacije**.
- SVG-ovi provereni kao **well-formed XML**; tagline (`European Transport Network Operations Platform`) u punom logu, `font-family: Arial, Helvetica, sans-serif`.

## Provere
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 121/121 |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja — baseline) |
| SVG XML well-formed (3/3) | ✅ |
| Vizuelna QA (raster) | ✅ Evropa prepoznatljiva, mreža čitljiva |

App nije diran → typecheck/jest/lint nepromenjeni u odnosu na baseline.

## Napomene
- **Obris = kurirani skup ~38 evropskih država** (bez Rusije/Turske/Kavkaza/Bliskog istoka/S. Afrike) radi čistoće i prepoznatljivosti; **Island uključen**. Silueta je spojena (bez unutrašnjih granica).
- **Wiring u aplikaciju** (splash/ikonica/login) je **zaseban zadatak** — po ovom zadatku app se ne dira. Stari `assets/brand/logo-horizontal*.svg` (kamion) ostaje u repou dok se zamena ne odobri.
- Kvaliteta: nema mrtvog koda ni runtime zavisnosti; asseti su jedini artefakt.
