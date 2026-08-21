# IZVEŠTAJ — BUG „ODJAVA NE RADI NA WEBU" (popravljeno)

> **Uzrok (potvrđen):** React Native `Alert.alert` sa dugmadima je **NO-OP na react-native-web** — dijalog se
> ne prikaže, pa se `onPress` (koji radi `supabase.auth.signOut()` + `router.replace`) **nikad ne izvrši**.
> Zato u browseru klik na „Odjava" ništa vidljivo ne uradi i **nema greške u konzoli** (ništa ne pukne — samo
> se potvrda „proguta"). Na native-u (Expo Go) Alert radi, pa je odjava radila.
> **Popravka:** deljeni web-safe `confirmAction()` (native: Alert; web: `window.confirm`); `useSignOut` ide kroz njega.
> Native tok netaknut. Commit `31bb04f` (push-ovan).

## Dijagnoza toka (po tački zadatka)
- `supabase.auth.signOut()` na webu radi ispravno **kad se pozove** — problem je što se **nije ni pozivao**.
- `session state`: `useSession` sluša `onAuthStateChange`; da je signOut prošao, gate bi se re-evaluirao. Nije stizao dotle.
- Krivac **(b)** iz zadatka: **Alert.alert potvrda no-op na webu**. Krivac (a) (redirect) nije bio uzrok — `router.replace`
  je već postojao unutar `onPress`, ali se `onPress` nije okidao. Sada, kad potvrda prođe, i signOut i redirect se izvrše.

## Izmene
| Fajl | Izmena |
|---|---|
| `src/lib/confirm.ts` (**nov**) | `confirmAction({title,message,confirmLabel,cancelLabel,destructive?})` → `Promise<boolean>`. Web: `window.confirm`; native: `Alert.alert` (cancel/destructive, `onDismiss→false`). Jedno rešenje za sve ekrane. |
| `src/features/auth/signOut.ts` | Uklonjen `Alert`; potvrda kroz `confirmAction`; na `false` prekid, na `true` → `signOut()` + `router.replace("/(auth)/sign-in")`. Poruka o nesinhronizovanom redu očuvana. |

## Ponašanje posle popravke
- **Web:** klik „Odjava" → `window.confirm` (radi) → potvrda → sesija očišćena → korisnik na login ekranu.
- **Native (Expo Go):** identično kao pre (Alert sa cancel/destructive) — **nepromenjeno**.

## Testovi
- `npm test` **121/121** ✅, `typecheck` ✅, `lint` 0 grešaka (4 upozorenja, baseline) ✅.
- Nov unit test **nije** dodat: konvencija projekta (`jest.config.js`) je „testiramo SAMO čiste funkcije (bez mreže/…)";
  `confirmAction` je tanak platform-branč omotač oko `Alert`/`window.confirm` (nije čista funkcija) → krhko RN-mockovanje
  bi išlo suprotno konvenciji. Pokriveno tipovima + ručnom logikom.

## i18n
Bez novih ključeva — koristi postojeće (`settings.signOut`, `settings.signOutConfirm`, `common.cancel`, `account.signOutPending`). Lokalizacije nisu dirane.

## OSTALA MESTA sa istim rizikom (Alert.alert no-op na WEBU) — NISU dirana u ovom zadatku
> Po zadatku (obim velik): popravljena SAMO odjava; ostalo se rešava zasebno **istim** `confirmAction` helperom.

### A) Destruktivne/akcione POTVRDE (višedugmadne — na webu se „progutaju", akcija izostaje) — PRIORITET
| Fajl:linija | Akcija |
|---|---|
| `src/features/reminders/ReminderFormModal.tsx:90` | brisanje roka (`reminders.deleteConfirm`) |
| `src/features/attachments/AttachmentsSection.tsx:75` | izbor izvora priloga (kamera/galerija) |
| `src/features/attachments/AttachmentsSection.tsx:104,121` | brisanje priloga (`attachment.deleteConfirm`) |
| `src/features/admin/CompanyDetailModal.tsx:39` | promena statusa firme (`admin.confirmStatus`) |
| `src/features/trips/TripDetailModal.tsx:214` | brisanje troška (`expense.deleteConfirm`) |
| `src/features/trips/stops.tsx:40` | brisanje stajanja (`trip.stops.deleteConfirm`) |
| `src/features/identity/InvitesSection.tsx:37` | otkazivanje pozivnice (`invite.cancelConfirm`) |
| `src/features/identity/AcceptInviteBox.tsx:27` | uspeh prihvatanja pozivnice → `onJoined` (na webu callback ne okine) |

### B) Informativni Alert (naslov/poruka, bez dugmadi) — na webu se ne vide (niža ozbiljnost)
Greške/obaveštenja tipa `Alert.alert(t("common.error"), msg)` u: `ReminderFormModal`, `NewCompanyWizard`, `InvoiceDetailModal`,
`AttachmentsSection`, `CompanyDetailModal`, `TripDetailModal`, `IssueInvoiceModal`, `InvoiceSettingsModal`, `NewTripModal`,
`PhoneOtpSteps`, `registerPush`, `InvitesSection`, `app/(auth)/sign-in.tsx`, `app/(owner)/customers.tsx`.
Predlog (zaseban zadatak): web-safe toast/inline poruka (npr. `window.alert` fallback ili in-app toast) kroz isti sloj.

## Provere (ritual)
| Provera | Rezultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 121/121 |
| `npm run lint` | ✅ 0 grešaka (4 upozorenja) |
| Native tok odjave | ✅ nepromenjen |
| Web tok odjave | ✅ confirm radi → sesija očišćena → login |
| Pravila kvaliteta (#1 bez dupliranja: jedan `confirmAction`) | ✅ ispoštovano |
| Commit + push | ✅ `31bb04f` na `main` |
