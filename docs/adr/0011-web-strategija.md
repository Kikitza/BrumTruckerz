# ADR 0011 — Web strategija

**STATUS: PREDLOG** (F3, kriška 1). Odluka se prihvata posle žive probe i pregleda vlasnika.

## KONTEKST (danas u kodu)
- Jedan kod (Expo + expo-router + TypeScript) radi na iOS/Android. `react-native-web` daje **treću metu — browser** iz istog koda, bez odvojenog projekta.
- Kancelarija (vlasnik/dispečer/platform_admin) sve više radi za **stolom** (fakture, naručioci, rokovi, izveštaji) — tamo je širok ekran prirodan. Vozač radi **na terenu, na telefonu** (kamera, km-unos, offline).
- Native-only moduli su duboko utkani: **offline red** (`expo-sqlite`, `src/lib/offline/`), **PDF** (`expo-print`/`expo-sharing`/`expo-file-system`), **push** (`expo-notifications`), **datetimepicker**, **kamera/galerija** (`expo-image-picker`). Neki od njih na webu ne postoje ili se ponašaju drugačije.

## ODLUKA
- **Web = ista baza koda** (react-native-web), **bez odvojenog Next.js/React admina** — jedan izvor istine za logiku/RLS/pozive; kancelarijski ekrani se dele sa mobilnim.
- **Ciljna publika weba v1 = KANCELARIJA** (owner/dispatcher/platform_admin). **Vozač ostaje mobilni** — na webu dobija ljubaznu poruku „koristi mobilnu aplikaciju" (offline red/kamera/km su native).
- **WEB JE UVEK ONLINE.** Offline red je **native-only**; web ga **ne koristi** (nema `expo-sqlite`, nema flush). Owner tok je ionako online (direktan RLS), pa web ništa ne gubi.
- **Platformske grane** za native-only module preko `src/lib/platform.ts` (`isWeb`/`isNative`): gde funkcija još nije za web → **ljubazna poruka** umesto pada (npr. PDF: „dostupno u mobilnoj aplikaciji").
- **Responsive v1 = max-width kontejner** (centriran sadržaj na širokom ekranu, kartice se ne razvlače). **Prave tabele/grid** (gušći prikaz kolona) dolaze kasnije, ekran po ekran.

## POSLEDICE
- (+) Nula duplikata poslovne logike; svaka F1/F2 funkcija odmah „stiže" i na web (uz platform-grane).
- (+) Kancelarija radi za stolom bez instalacije; deljenje linka, brža obuka.
- (−) Svaki native-only tok mora imati web granu ili poruku — mapa u izveštaju je lista sledećih zadataka.
- (−) react-native-web nije piksel-identičan; neki UI elementi (nativni pickeri) traže web zamene (već: DateField web unos).
- Bezbednost nepromenjena: web koristi isti anon ključ + RLS; nema novih tajni.

## ODBAČENE ALTERNATIVE
1. **Odvojen Next.js admin (sada).** Odbačeno: duplira modele/pozive/validacije/RLS-mentalni-model; dva build/deploy toka; rizik da se logika raziđe. Kad/ako zatreba SEO-marketing sajt ili teški BI dashboard — zaseban ADR; to nije app.
2. **Web za vozača v1.** Odbačeno: vozačev tok je offline/kamera/km — suštinski native; web verzija bi bila osakaćena i zbunjujuća. Vozač = telefon.
3. **Web takođe offline (sqlite-wasm/IndexedDB red).** Odbačeno za v1: kancelarija je online; uvođenje drugog offline motora za web je veliki trošak bez potrebe.
4. **Piksel-perfektne tabele odmah.** Odbačeno za v1: prvo dokazati da isti kod radi u browseru (proof-of-life) + jedan uzorni ekran; tabele idu inkrementalno.

## OBIM PROBE (F3 kriška 1 — šta se meri)
- Expo web se pokreće (dev server) i **export bez grešaka**; startup ne pada zbog native modula (grane u `_layout`).
- Email prijava + gate/uloge rade u browseru; vozaču poruka; tabovi se otvaraju.
- **Fakture** doterane za širok ekran (max-width) kao uzorak.
- Mapa „radi / ne radi još / native-only zauvek" u izveštaju = plan sledećih kriški.
