# IZVEŠTAJ — F3 „WEB DOVRŠETAK": kompresija slika + desktop poliranje

> Web = uvek online, kancelarija. **Native netaknut** (sve web grane su iza `isWeb`). Commit `072a8a6` (push-ovan).

## 1) Kompresija slika na webu ✅
- **Novo:** `src/lib/webFile.ts` → `compressImageForUpload(file, {maxEdge, quality})` — ugrađeni `<canvas>` (bez teških biblioteka):
  smanji na **dužu stranu ≤ 1600px**, **JPEG ~0.8**, **zadrži odnos stranica**; samo smanjuje (nikad ne uvećava).
  Ako slika već staje / dekodovanje ne uspe / rezultat NIJE manji → **vrati original** (bez gubitka). GIF/SVG se ne diraju.
- **Ugrađeno u** `AttachmentsSection.addFromComputer` (web upload) pre `uploadAttachmentWeb`. `storage_key` ostaje
  `company_id/trip_id/uuid.jpg`, `contentType` sada **stvarno** `image/jpeg` (doslednije nego pre — ranije se npr. PNG
  slao pod `.jpg` ključem). 8MB gard na izvorni fajl ostaje.

### Pre/posle (isti algoritam: duža strana 1600 + JPEG q80; ImageMagick analog canvas puta)
| Primer | Pre | Posle | Ušteda |
|---|---|---|---|
| Telefonska foto dokumenta 4032×3024 | 3843 KB | 1600×1200, **323 KB** | ~**92%** |
| Skenirana A4 2480×3508 | 104 KB | 1131×1600, **9 KB** | ~**91%** |

> Napomena: brojevi su iz reprezentativnog merenja (browser canvas nije dostupan u CI-u); algoritam je identičan onome u kodu.

## 2) Desktop poliranje (DesktopContainer / tamna tema) ✅
| Ekran | Šta je urađeno |
|---|---|
| **Rokovi** (`(owner)/reminders.tsx`) | umotan u `DesktopContainer maxWidth=900` (prazan + lista) — bez razvučenih kartica; puna širina nosi boju teme (bez belih ivica) |
| **Podešavanja** (`(owner)/settings.tsx`) | umotan u `DesktopContainer maxWidth=720` — uža, centrirana kolona (paket, izdavalac, pozivnice, odjava) |
| **SVI modali** (`components/form.tsx` → `ModalScaffold`) | na webu sadržaj **centriran, `maxWidth 640`** — jedna izmena doteruje: **Izdavalac** (`InvoiceSettingsModal`), **Naručilac detalj/forma** (`CustomerFormModal`), forme rokova/tura/troška/firme — polja se više ne razvlače preko celog ekrana |

- **DRY:** umesto po-ekran doterivanja modala, jedna izmena u `ModalScaffold` pokriva sve (KVALITET #1).
- **Funkcionalnost nedirana** — samo raspored/širine na širokom webu; native je providan (`isWeb` gard).

## 3) Sitno / izlistano (bez širenja obima)
- `reports.tsx` je **stub** („reports — TODO"), bez sadržaja za poliranje — ostavljen; kad dobije sadržaj, umotati u `DesktopContainer`.
- **Hover/cursor-pointer** na klik-elementima na webu: nije sistemski uveden (bio bi rasut zahvat kroz mnoge `Pressable`).
  Predlog za zaseban prolog: dodati deljeni web `cursor: "pointer"` sloj (npr. u `Screen`/reusable dugme) umesto po komponenti.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 125/125 (18 suita) |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| `expo export --platform web` | ✅ build prolazi (exit 0) |
| Native (Expo Go) | ✅ nedirano (sve web grane iza `isWeb`) |
| i18n | ✅ nije diran (nema novih ključeva u ovom zadatku) |
| KVALITET KODA | ✅ jedan helper za kompresiju, jedna izmena za sve modale (bez dupliranja) |
| Commit + push | ✅ `072a8a6` na `main` |

## Šta ostaje (F3)
- `reports.tsx` sadržaj (poseban zadatak) + njegov desktop-pass.
- Opcioni web „mikro-utisak": hover/cursor sloj (gore).
