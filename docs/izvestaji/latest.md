# IZVEŠTAJ — SPLASH DORADA: nalaz o „starom kamionu na splash-u"

> **Zaključak (najvažnije):** u repou **NEMA nijednog starog kamion-fajla** u splash lancu — sve već pokazuje
> ETNOP Evropa znak (od commita `d99df9c`). „Kamion pre koda" je **nativni splash zapečen u PRETHODNO
> INSTALIRANOM buildu** (napravljenom pre rebranda). **Krivac nije fajl u repou — nego stari binarni build.**
> Rešenje: **nov build**. (Zato nije bilo šta da se „zameni"; commit nosi ovaj nalaz.)

## 1) Grep splash lanca — svaki ref → na koji fajl pokazuje
| Ref (mesto) | Pokazuje na | Stanje |
|---|---|---|
| `app.config.ts` → `expo-splash-screen.image` (+`dark.image`) | `./assets/splash-icon.png` | ✅ NOVI znak; `backgroundColor #0B1220` (i za dark) |
| `app.config.ts` → `icon` | `./assets/icon.png` | ✅ NOVI znak (puna `#0B1220`) |
| `app.config.ts` → `android.adaptiveIcon.foregroundImage` | `./assets/adaptive-icon.png` | ✅ NOVI znak (izvor **Android 12+ sistemskog splash-a**) |
| `app.config.ts` → `web.favicon` | `./assets/icon.png` | ✅ NOVI znak |
| `package.json` | `expo-splash-screen ~31.0.13` | plugin (ne ručni asset) |

**Nema:** `app.json`, `android/` ili `ios/` prebuild dir, legacy `android.splash`/`ios.splash` (`expo config` → oba `null`),
niti ijedan stray fajl (`splash.png`, `*truck*`, `*kamion*`, `logo-horizontal*`). `.gitignore` ne skriva nijedan asset.

## 2) Vizuelna potvrda sadržaja PNG-ova (rasterski pregled, ovaj zadatak)
- `assets/splash-icon.png` (1024×1024, providan) — **Evropa dot-map** ✅ (ne kamion)
- `assets/adaptive-icon.png` (1024×1024, providan, sigurna zona) — **Evropa dot-map** ✅
- `assets/icon.png` (1024×1024, puna `#0B1220`) — **Evropa dot-map** ✅

## 3) `expo config` (razrešeno)
```
icon:                 ./assets/icon.png
android.adaptiveIcon: { foregroundImage: ./assets/adaptive-icon.png, backgroundColor: #0B1220 }
expo-splash-screen:   { image: ./assets/splash-icon.png, imageWidth: 200, resizeMode: contain,
                        backgroundColor: #0B1220, dark: { image: ./assets/splash-icon.png, backgroundColor: #0B1220 } }
android.splash: null   ios.splash: null
```

## 4) KRIVAC (tačno)
**Prethodno instalirani nativni build** (APK/binarni paket napravljen PRE rebranda, tj. pre `d99df9c`).
`expo-splash-screen` **zapeče** splash sliku i boju u nativni paket u **BUILD vremenu** (managed workflow, bez `android/`
resursa). Izmena `assets/*.png` **ne stiže** do već instalirane aplikacije dok se ne napravi **NOV build**. Kako je
**F4 production build pauziran** (čeka Firebase „1a/1b"), telefon i dalje ima **pre-rebrand** binarni paket → stari kamion-splash.

## 5) Zašto nema izmene koda/asseta
Sve u repou je **već ETNOP** (splash-icon/adaptive-icon/icon + `app.config` boje) od `d99df9c`. Nije postojao „leftover"
kamion-fajl da se zameni — zamena je urađena ranije. Fabrikovati izmenu bi bilo netačno. **Nijedan drugi ekran nije diran.**

> **Napomena o commit poruci:** zadata poruka je pretpostavljala postojanje kamion-fajla; pošto ga nema, commit nosi
> tačan nalaz (verifikacija lanca), a ne fiktivnu „zamenu".

## 6) REŠENJE (potez vlasnika)
Napravi **nov build** — splash/ikonica postaju ETNOP na uređaju:
```
eas build --platform android --profile production   # (versionCode se auto-increment-uje)
```
Za ranu proveru bez čekanja F4: može i `--profile preview` (APK) — isti splash asseti. (Splash NIJE OTA-updatable;
mora nov binarni build.) Mogu pripremiti/pokrenuti uz tvoju potvrdu (vezano za F4).

## Provere
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ (kod nedirano) |
| `npm test` | ✅ 121/121 |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja) |
| `expo config` splash/icon | ✅ svi → ETNOP asseti, `#0B1220` |
| Vizuelna QA 3 PNG-a | ✅ svi Evropa dot-map |
