# IZVEŠTAJ — NOV PRODUKCIONI BUILD (samo brend; Firebase/push preskočen)

> **Cilj:** instalirana aplikacija dobija **ETNOP ikonicu + Evropa splash + novi logo**. Firebase/cron NIJE diran.
> Build je pokrenut na EAS (queued). Splash/ikonica se peku u nativni paket u build-vremenu → stižu s ovim buildom.

## Link builda
**https://expo.dev/accounts/kikitzas-team/projects/kikitza/builds/df3e2e3a-170c-40c0-b249-64990d0553bf**

- Platforma: **Android**, profil: **production**, tip: **APK**
- **versionCode: 4 → 5** (auto-increment; `appVersionSource: remote`, `autoIncrement: true`)
- Android credentials: **remote keystore sa EAS servera** (`Build Credentials I5m2sqRrSb`) — bez novih ključeva
- Env iz `production` profila: `EXPO_PUBLIC_PHONE_LOGIN=0` (telefon login ostaje isključen), PROD Supabase URL/anon
- Autentikacija: `EXPO_TOKEN` (nalog `kikitza` / `kikitzas-team`, Owner) — **vrednost tokena se NE upisuje**

## 1) Potvrda brend-asseta (ova sesija)
| Asset | Dimenzije | Sadržaj (vizuelna QA) | Podloga |
|---|---|---|---|
| `assets/icon.png` | 1024×1024 RGBA | **Evropa dot-map** ✅ | puna `#0B1220` |
| `assets/adaptive-icon.png` | 1024×1024 RGBA | **Evropa dot-map** ✅ | providna (sig. zona) |
| `assets/splash-icon.png` | 1024×1024 RGBA | **Evropa dot-map** ✅ | providna |

`app.config.ts`: `expo-splash-screen.backgroundColor = #0B1220` (i `dark`), `adaptiveIcon.backgroundColor = #0B1220`. Nijedan kamion.

## 2) Šta build donosi na uređaj (prvi put posle rebranda)
- **App ikonica** → ETNOP Evropa znak (bila je stara jer je prethodni paket pre-rebrand).
- **Splash** → Evropa znak na `#0B1220` (splash se ne može OTA-update-ovati; morao je nov binarni build).
- **Boot/login/PDF header** → već ETNOP (od `d99df9c`), sad i nativni omotač prati.

## 3) Šta NIJE dirano (po zadatku)
- **Firebase / `google-services.json`** — preskočeno; push na ovom buildu **neće raditi** dok se ne uveže FCM (zaseban zadatak).
- **reminders-cron / CRON_SECRET / pg_cron raspored** — netaknuto (ostaje ACTIVE na PROD-u).
- **Identifikatori** — `com.brumtruckerz.app`, `scheme`, EAS slug `kikitza` — nepromenjeni.

## Sledeći potez vlasnika
1. Sačekaj da build završi (link gore → status/`Install`), pa instaliraj APK na telefon.
2. Vizuelno potvrdi: **ETNOP ikonica** na launcher-u + **Evropa splash** pri pokretanju.
3. Za push (kasnije): vrati se na Firebase korake iz prethodnog izveštaja (`google-services.json` + FCM V1 ključ).

## Provere
| Provera | Rezultat |
|---|---|
| Brend PNG-ovi = Evropa znak (vizuelna QA) | ✅ sva tri |
| `app.config` splash/adaptive `backgroundColor` | ✅ `#0B1220` |
| EAS auth (`EXPO_TOKEN`) | ✅ `kikitza`/`kikitzas-team` (Owner) |
| Build queued + versionCode inkrement | ✅ 4 → 5 |
| Firebase/cron netaknuti | ✅ (po zadatku preskočeno) |
| Tajne u izveštaju | ✅ nijedna (samo link builda) |
