# IZVEŠTAJ — F3: PDF NA WEBU + PRILOZI SA RAČUNARA (+ ADR 0011 PRIHVAĆEN)

> STATUS: **URAĐENO na DEV-u i COMMITOVANO+PUSH-ovano** (commit-first; izveštaj u istom commitu).
> Web export prolazi bez grešaka; mobilno netaknuto.

## KORAK 0 — ADR 0011 PRIHVAĆEN
`docs/adr/0011-web-strategija.md`: **STATUS: PREDLOG → PRIHVAĆENO (20.8.2026)**.

## 1) PDF fakture na webu — „Štampaj / Sačuvaj PDF"
- U detalju fakture, na **webu** dugme postaje **„Štampaj / Sačuvaj PDF"** → `Print.printAsync({ html })` sa **ISTIM HTML
  šablonom** (`buildInvoiceHtml`, sr/en) → **browser print dijalog**. Knjigovođa iz „Sačuvaj kao PDF" dobija PDF fajl na
  disk; izgled identičan mobilnom PDF-u.
- Na **native**-u ostaje „Podeli PDF" (generisanje fajla + deljenje + arhiva u `prilozi`).
- **Sekundarno (pravi PDF bajtovi + upload sa weba) — ODLOŽENO, obrazloženo:** `expo-print` `printToFileAsync` **nije
  podržan na webu**, a generisanje PDF bajtova u browseru traži **tešku zavisnost** (`jsPDF`/`pdf-lib`). Za v1: web daje
  print/„Save as PDF" (knjigovođa ima papir/PDF), a **arhiva** (deterministički upload) i dalje nastaje sa **mobilnog** —
  isti ključ, pa se web i mobilni ne razilaze. (Prihvatljivo v1 po zadatku.)

## 2) Prilozi sa računara (web)
- **`src/lib/webFile.ts`** (novo) — `pickImageFile()` (skriveni `<input type="file" accept="image/*">`); `document` se
  dodiruje samo unutar funkcije → uvoz bezbedan i na native.
- **`attachments/api.ts` `uploadAttachmentWeb`** — **DIREKTAN upload** (web je uvek online — bez offline reda, ADR 0011):
  isti ključ `company_id/trip_id/uuid.jpg` i storage pravila (0008) kao mobilni; upis reda u `attachments`.
- **`AttachmentsSection`** — na webu „＋" otvara izbor fajla → size-cap **8 MB** → upload; **pregled otvara u NOVOM TABU**
  (signed URL) umesto modala. Na native-u kamera/galerija + modal (nepromenjeno).
- **Kompresija/размер (obrazloženje):** mobilni komprimuje pre uploada (`pickAndCompress`); na webu bi canvas-resize bio
  dodatni kod — v1 koristi **razuman size-cap (8 MB)** i upload kako-jeste. Kompresija na webu je moguća kasnija dorada.

## 3) Platforma / ništa mobilno pokvareno
- Sve grane kroz postojeći `src/lib/platform.ts` (`isWeb`); native putanje 1:1 očuvane (kamera/offline/modal/PDF-share).
- `web.pdfMobileOnly` uklonjen (web sada štampa) — više se ne koristi.

## Test matrica
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ čisto |
| `npm test` (jest) | ✅ 17 suita / 121 test |
| `npm run lint` | ✅ 0 grešaka (4 postojeća upozorenja) |
| `npm run test:db` | ✅ ALL PASSED (10 svita — nepromenjeno) |
| `expo export --platform web` | ✅ bez grešaka |
| Expo Go (native) | ✅ nedirnuto — sve grane `isWeb`-uslovljene |

## Migracije / deploy
- **Nema migracija / Edge / Auth.** Čisto klijentski. `dist/` u `.gitignore`.

## Jezici
i18n **dopunjen u SVIH 30 jezika** — `invoice.printPdf`, `attachment.tooLarge`, `attachment.imagesOnly`; uklonjen
`web.pdfMobileOnly`. `sr`/`en` autorski; 28 mašinski.

## Mapa (ažurirano — prethodne „NE RADI JOŠ" stavke sad rešene)
- **PDF fakture (web)** → ✅ RADI (print/„Save as PDF"); *arhiva-upload sa weba ostaje odloženo (heavy dep).*
- **Prilozi/dokumenti (web)** → ✅ RADI (fajl sa računara, direktan upload, pregled u novom tabu).
- Ostaje: prave tabele/desktop poliranje ostalih ekrana; web-kompresija slika; datumski kalendar-widget.

## Kvalitet koda
Grane kroz `platform.ts`; reuse `buildInvoiceHtml` (isti izgled web/mobilni); `uploadAttachmentWeb` deli ključ/pravila sa
mobilnim; bez duplirane logike. **Pravila kvaliteta ispoštovana.**

## ČEKA SE (potez vlasnika)
1. Živa proba u browseru: „Štampaj / Sačuvaj PDF" na fakturi + kačenje priloga sa računara.
2. Sledeće web kriške: desktop tabele/poliranje ekrana (uz `DesktopContainer`), web-kompresija slika, kalendar-widget.
