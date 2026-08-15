# Zastave (izbor jezika)

Zastave koje se koriste u izboru jezika (login + zaglavlje ekrana).

## Izvor i licenca
- Paket: **[flag-icons](https://github.com/lipis/flag-icons)** v7.5.0
- Licenca: **MIT** © 2013 Panayiotis Lipiridis (v. tekst licence u paketu / repozitorijumu).
- Format: SVG 4:3 (viewBox `0 0 640 480`), kopirano iz `flag-icons/flags/4x3/`.
- Kopira se **samo potreban podskup** (po jedna zastava za svaki podržani jezik), ne ceo paket.

## Mapiranje jezik → zastava (zemlja)
Definisano na jednom mestu: `src/i18n/languages.ts`. Ime fajla = ISO kod zemlje:

| Jezik | Zastava | | Jezik | Zastava |
|---|---|---|---|---|
| sr | rs | | no | no |
| en | gb | | et | ee |
| de | de | | lv | lv |
| fr | fr | | lt | lt |
| es | es | | uk | ua |
| it | it | | ru | ru |
| pt | pt | | tr | tr |
| nl | nl | | sq | al |
| pl | pl | | mk | mk |
| cs | cz | | bs | ba |
| sk | sk | | hr | hr |
| hu | hu | | sl | si |
| ro | ro | | el | gr |
| bg | bg | | sv | se |
| da | dk | | fi | fi |

## Dodavanje novog jezika
1. Kopiraj `flag-icons/flags/4x3/<zemlja>.svg` u `assets/flags/`.
2. Dodaj red u `src/i18n/languages.ts` (kod, naziv na tom jeziku, import zastave, `verified`).
3. Dodaj `src/locales/<kod>.json` (svi ključevi iz `en.json`).
