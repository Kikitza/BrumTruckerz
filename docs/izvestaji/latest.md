# IZVEŠTAJ — REBRAND → ETNOP (samo prikazni sloj; identifikatori nepromenjeni)

> DEV. Ime = **ETNOP**; tagline (jedna konstanta, ne prevodi se) = „European Transport Network Operations Platform".
> Provere čiste; `expo config` razrešava `name = ETNOP` (Expo Go/app lista). Identiteti netaknuti.

## Brend konstanta (jedini izvor)
- **NOVO `src/lib/brand.ts`** — `BRAND_NAME = "ETNOP"`, `BRAND_TAGLINE = "European Transport Network Operations Platform"`.
  Tagline se **NE prevodi** (enterprise standard: brend na engleskom u svih 30 jezika).

## 1) Prikazni sloj (sve što korisnik vidi) — IZMENJENO
| Mesto | Izmena |
|---|---|
| `app.config.ts` → `name` | „BrumTruckerz" → **„ETNOP"** (ime u Expo Go/app listi/splash) |
| `app/(auth)/sign-in.tsx` | **ETNOP** krupno (44pt) + **tagline** manjim slovima ispod; uklonjen stari logo-wordmark (prikazivao „BrumTruckerz") |
| `src/features/invoices/pdf.ts` | PDF **header: ETNOP + tagline ispod** (brend dokumenta; iznad „FAKTURA/INVOICE"); tagline uvek EN bez obzira na jezik fakture |
| `src/features/notifications/registerPush.ts` | Android notifikacioni kanal `name` → `BRAND_NAME` (ETNOP); vidljivo u sistemskim podešavanjima |
| `src/locales/*.json` (SVIH 30) | `common.driverUseMobile` — brend pomen „BrumTruckerz" → **„ETNOP"** |

> Push **naslovi** (`reminders-cron`): „Rok ističe" / „Servis vozila" — **ne pominju ime**, pa ostaju nepromenjeni.

## 2) Dokumentacija — IZMENJENO
| Fajl | Izmena |
|---|---|
| `README.md` | naslov → **„# ETNOP — starter"** |
| `CLAUDE.md` | naslov + uvod („**ETNOP** — mobilna aplikacija…") + **red o internom nasleđu**: „brumtruckerz" u identifikatorima je **trajno** |
| `docs/MASTER-PLAN.md` | naslov → ETNOP + **v1.1 beleška o rebrandu** (samo prikazni sloj; identiteti i istorija netaknuti) |

## 3) Grep celog repoa („BrumTruckerz"/„Brum") — ŠTA OSTAJE i ZAŠTO
Sve preostale pojave su **identitet / tehnika / istorija** (nijedna nije korisniku vidljiva kao brend):

| Mesto | Ostaje jer… |
|---|---|
| `app.config.ts` `android.package` + `bundleIdentifier` `com.brumtruckerz.app` | **tehnički id instalirane aplikacije — NIKAD se ne menja** (eksplicitno) |
| `app.config.ts` `scheme: "brumtruckerz"` | deep-link identifikator (menjanje bi razbilo linkove) |
| `package.json` `name`, `.devcontainer/devcontainer.json` `name` | npm/dev-container identifikator; **repo ime se u ovom zadatku ne menja** |
| EAS `slug: "kikitza"` / `projectId` | EAS projekat-identifikator (nepromenjen) |
| `CLAUDE.md` `BrumTruckerz-dev`, `RUNBOOK.md` (Supabase project imena, `brumtruckerz.com`, starter zip, repo ime) | Supabase refs + operativne/infra instrukcije; identifikatori |
| `supabase/DEV-SEED.sql` company „BrumTruckerz", `supabase/STAGING-SEED.sql` `@brumtruckerz.seed` | **sadržaj baze / seed identifikator** (email-match za čišćenje) — ne dira se |
| `docs/AUDIT-BRUMTRUCKERZ-2026-08.md` + `docs/AUDIT-SAZETAK.md` (naslov, telo, ime fajla) | **ISTORIJSKI audit — istorija ostaje istinita** |
| `docs/projektni-zadatak.md` „Naziv: BrumTruckerz" | PRD/istorijski spec (van liste izmena; istorija) |
| `assets/brand/brand.md` + logo/icon/splash asseti | vodič **postojećeg** znaka; **logo redizajn = zaseban asset zadatak** (nov ETNOP mark nije isporučen). Login zato prikazuje ETNOP **tekstualni** wordmark, a ne stari SVG. |
| `src/lib/brand.ts`, `CLAUDE.md`, `MASTER-PLAN.md` (pomeni „brumtruckerz") | namerne **napomene o nasleđu/rebrandu** (objašnjavaju zašto identifikatori ostaju) |

**Namerno NIJE dirano** (po zadatku): android.package, BT-D/BT-T brojevi, EAS slug/projekat, Supabase refs, storage ključevi, sadržaj baze, repo ime, istorijski izveštaji i ADR.

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` (jest) | ✅ 121/121 |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja) |
| `expo export --platform web` | ✅ |
| `expo config` → `name` | ✅ **ETNOP** (package/slug/scheme nepromenjeni) |

## Jezici
i18n **dopunjen u SVIH 30** — brend pomen (`common.driverUseMobile`) → ETNOP; sr/en autorski, ostali mašinski.
Status fajlova (`machine`/`verified`) **nije** menjan. `en` ostaje fallback; nijedan ključ nije dodat/uklonjen (samo vrednost brend tokena).

## Kvalitet koda
Brend kroz **jednu deljenu konstantu** (`src/lib/brand.ts`) — bez duplirane niske; login/PDF/push kanal je čitaju.
Bez mrtvog koda (uklonjeni nekorišćeni logo importi u `sign-in.tsx`). Pravila kvaliteta ispoštovana.

## Napomena (van scope-a, za kasnije)
- **ETNOP logo/ikonica/splash art** — nije isporučen nov znak; `assets/brand/*` i splash/icon PNG još nose stari mark. Zaseban asset zadatak.
- **F4 (push finale)** ostaje pauziran dok vlasnik ne potvrdi „1a/1b gotovo" (Firebase/FCM). Nezavisno od ovog rebranda.
