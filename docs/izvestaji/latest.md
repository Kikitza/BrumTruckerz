# IZVEŠTAJ — WEB-SAFE POTVRDE/OBAVEŠTENJA (dovršetak)

> Nastavak popravke „odjava ne radi na webu". Uzrok je isti za celu klasu: **RN `Alert.alert` je NO-OP na
> react-native-web** → destruktivne potvrde se „progutaju" (akcija izostane), a greške/obaveštenja se ne vide.
> Sve **web-dostupne (vlasnik/auth)** tačke sada idu kroz **jedan** helper `src/lib/confirm.ts`
> (`confirmAction` + novi `notify`). **Native tok nepromenjen.** Commit `c06b571` (push-ovan).

## Helper (`src/lib/confirm.ts`)
- `confirmAction({title, message?, confirmLabel, cancelLabel, destructive?}) → Promise<boolean>` — web: `window.confirm`; native: `Alert.alert` (cancel/destructive, `onDismiss→false`).
- **`notify({title, message?, okLabel?}) → Promise<void>`** (novo) — web: `window.alert` (blokira → razreši); native: `Alert.alert` (razreši na tap/dismiss; bez `okLabel` ostaje sistemsko OK → native 1:1). `okLabel` daje dugme koje razrešava pre nastavka (npr. „Gotovo" → `onJoined`).

## Lista A — VIŠEDUGMADNE POTVRDE (sad rade na webu) ✅
| Fajl | Akcija |
|---|---|
| `reminders/ReminderFormModal.tsx` | brisanje roka |
| `attachments/AttachmentsSection.tsx` | brisanje priloga (sinhronizovan **i** pending) |
| `admin/CompanyDetailModal.tsx` | promena statusa firme (nedestruktivan confirm) |
| `trips/TripDetailModal.tsx` | brisanje troška |
| `trips/stops.tsx` | brisanje stajanja |
| `identity/InvitesSection.tsx` | otkazivanje pozivnice |
| `identity/AcceptInviteBox.tsx` | **uspeh prihvatanja → `onJoined` okine i na webu** (bez ovoga nov član nije ulazio u firmu preko browsera) |
| `(owner)/customers.tsx` | arhiviranje **i** brisanje naručioca *(dodatno nađeno — nije bilo u pređašnjoj listi A)* |
| `(owner)/fleet.tsx` | brisanje vozila/prikolice/vozača + brisanje naloga vozača *(dodatno nađeno — glavni CRUD ekran)* |

## Lista B — INFORMATIVNI ALERT (greške/obaveštenja, sad vidljivi na webu) ✅
Prebačeno na `notify`: `sign-in`, `EmailSignUp` (greška + „potvrdi mejl"), `NewCompanyWizard`, `IssueInvoiceModal`,
`InvoiceDetailModal`, `InvoiceSettingsModal`, `NewTripModal`, `CustomerFormModal`, `customers.tsx`,
`fleet.tsx` (greške + poruke o limitu paketa), plus greške u svim gore navedenim A-fajlovima
(`ReminderFormModal`, `AttachmentsSection`, `CompanyDetailModal`, `TripDetailModal`, `InvitesSection`).

## Namerno OSTAVLJENO (native-only — nema web put, nema bага) — za info
| Fajl | Zašto |
|---|---|
| `attachments/AttachmentsSection.tsx` → `addPhoto` | troslojni izbor izvora (kamera/galerija); web koristi `addFromComputer` (v. `isWeb` grana) |
| `notifications/registerPush.ts` | push-dozvola rationale — push ne postoji na webu |
| `auth/PhoneOtpSteps.tsx`, `identity/PhoneChange.tsx` | telefon/OTP tok je native |
| `app/(driver)/index.tsx` | vozač je na webu blokiran (`DriverWebNotice` u `app/index.tsx`) → ekran se ne renderuje na webu |

> Ako se ubuduće otvori native-only tok za web (npr. vozač na webu), ta mesta se prebace istim helperom.

## Ponašanje
- **Web:** potvrde → `window.confirm`; greške/obaveštenja → `window.alert`; `AcceptInviteBox` posle „OK" pokreće `onJoined` (ulazak u firmu radi).
- **Native (Expo Go):** identično kao pre (Alert sa cancel/destructive; sistemsko OK) — **nepromenjeno**.

## i18n
Bez novih ključeva — korišćeni postojeći (`common.*`, `*.deleteConfirm`, `*.confirm*`, `plan.limitReached`, `auth.confirmEmailSent`, …). Lokalizacije nisu dirane.

## Testovi / kvalitet
- Nov unit test **nije** dodat: konvencija (`jest.config.js`) je „SAMO čiste funkcije"; `confirmAction`/`notify` su platform-branč omotači (Alert/window) — ne čiste funkcije. Pokriveno tipovima + revizijom.
- Slojevi/DRY (KVALITET #1): jedan helper za sve ekrane; bez dupliranja.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 121/121 |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja, baseline) |
| Native tok (Expo Go) | ✅ nepromenjen |
| Web tok (potvrde/greške/prihvatanje pozivnice) | ✅ rade |
| Commit + push | ✅ `c06b571` na `main` |

## Šta ostaje
Ništa blokirajuće. Preostali `Alert.alert` su isključivo native-only tokovi (tabela gore); mogu se ujednačiti istim helperom u zasebnom prolazu ako/ kad ti tokovi dobiju web verziju.
