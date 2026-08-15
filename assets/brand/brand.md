# BrumTruckerz — brand vodič (v1)

## Ime i koncept
**Brum** = zvuk motora; **Truckerz** = zajednica vozača. Znak to prevodi doslovno:
**kamion u pokretu napred** (aerodinamični nos kabine, artikulisana prikolica) +
**tri „brum" linije** — zvuk motora pretvoren u vizuelni potpis. Kamion je uvek
okrenut **udesno** (napred = napredak); linije su uvek **iza** njega.

## Paleta (== dizajn tokeni aplikacije — brend i proizvod govore isto)
| Uloga | HEX | Upotreba |
|---|---|---|
| Ink (primarna) | `#16233B` | telo znaka i wordmark na svetlom |
| Teal (signal) | `#0E7C6B` | brum linije, „Brum" u wordmarku, akcenti |
| Teal light | `#3BB79F` | teal na tamnim podlogama |
| White | `#FFFFFF` | znak na tamnom / app ikona |
| Amber (sekundarna) | `#B4741A` | upozorenja u proizvodu; NE u logotipu |

## Tipografija wordmarka
**Archivo 800** (Google Fonts, open source; fallback Inter/system).
Dvotonski lockup: `Brum` u tealu, `Truckerz` u ink boji.
Za štampu/final: konvertovati tekst u krive (outline) pre predaje.

## Fajlovi (`assets/brand/`)
- `logo-mark.svg` — znak, svetla podloga (primarni)
- `logo-mark-dark.svg` — znak, tamna podloga
- `logo-mark-mono.svg` — jedna boja (`currentColor`): pečat, graviranje, 1-color print
- `logo-horizontal(.dark).svg` — znak + wordmark
- `app-icon.svg` — 1024×1024, ink podloga, zaobljenje 228

## Pravila upotrebe
- **Zaštitni prostor:** oko znaka minimalno prečnik jednog točka sa svake strane.
- **Minimalne veličine:** znak ≥ 24 px visine; horizontalni lockup ≥ 120 px širine; ispod toga koristiti samo znak.
- **Tamne podloge:** uvek `-dark` varijanta (beli kamion + teal light). Nikad ink znak na tamnom.
- **Ne raditi:** rotacija ili ogledalo (kamion nikad ne ide „unazad"), senke/gradijenti na znaku, menjanje boja delova, razdvajanje linija od kamiona, kompresovanje/razvlačenje.
- Jedna boja dostupna? → mono varijanta, nikad ručno prebojavanje.

## Ikone za prodavnice
- **iOS:** `app-icon.svg` izvesti u PNG 1024×1024 (Apple sam zaobljuje — izvor je pun kvadrat; naš rx=228 je za pregled/marketing).
- **Android (adaptive):** foreground = znak (beli kamion + teal linije) na transparentnoj podlozi sa ~66% safe-zone, background = puna `#16233B`. Ne koristiti gotov zaobljeni kvadrat kao adaptive.
- Favicon/monohrom (Android 13+ themed icon): `logo-mark-mono.svg`.

## Zastave (izbor jezika)
Zastave za izbor jezika NISU brend-asset — dolaze iz paketa **flag-icons** (MIT). Smeštene su odvojeno u `assets/flags/` sa atribucijom u `assets/flags/README.md`. Mapiranje jezik→zastava je u `src/i18n/languages.ts`.
