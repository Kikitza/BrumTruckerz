# ADR 0004 — Geografija (države i mesta)

## KONTEKST (danas u kodu/šemi)
- Sve „gde" je **slobodan tekst**: `trips.origin` / `trips.destination` (`0003_trip_route_medical.sql:11-12`), `trip_stops.place` (`0010:22`), `expenses.country` (`0001:137`), `restrictions.country` / `resources.country` (`0001:189,203`).
- `title` ture se generiše kao „origin → destination" u kodu (`0003:2-6`).
- Nema ISO šifarnika; „Nemačka/Njemačka/Germany/DE" su različiti tekstovi → izveštaji po zemlji su nepouzdani.

## ODLUKA
- **Država = ISO 3166-1 alpha-2 šifarnik** (referentna tabela / enum vrednosti), kraj slobodnog teksta za državu. **Mesto ostaje tekst** uz **normalizaciju** (trim/collapse razmaka, opciono mapiranje sinonima), jer pun geokoder nije u opsegu MVP-a.
- Polja koja nose zemlju dobijaju `country_code` (FK/CHECK na ISO), a slobodni tekst zemlje se povlači u prelaznom periodu.
- **Odbačeno:** (a) pun geokoding/GIS (lat/lon, PostGIS) — preskupo i van potrebe sada (ostaje za GPS/rutiranje, ADR 0010 / MASTER-PLAN F5); (b) ostaviti slobodan tekst — trajno kvari analitiku po zemlji; (c) šifarnik mesta — nemoguće održavati za celu Evropu.

## SKICA ŠEME (nacrt)
```
countries (referentni)
  code  text pk        -- ISO alpha-2 ('DE','RS','HU'...)
  name_key text        -- i18n ključ (prikaz kroz t(), pravilo #7)
-- dodaci na postojeće:
  trips.origin_country_code / destination_country_code  text → countries(code)
  trip_stops.country_code   text → countries(code)
  expenses.country_code     text → countries(code)   -- uz zadržan expenses.country (most)
  restrictions.country_code / resources.country_code
-- mesto: place ostaje text; normalize_place(text) helper u kodu
```

## MIGRACIONI PUT (bez prekida)
1. Aditivno: `countries` + `*_country_code` kolone (nullable).
2. Backfill na stagingu: best-effort mapiranje postojećeg slobodnog teksta → ISO (rečnik sinonima); nemapirano ostaje `null` + izveštaj šta ručno dočistiti.
3. Slobodna tekst-polja ostaju kao **most** dok se unos ne prebaci na šifarnik; forme prelaze na izbor države.
4. PROD uz odobrenje.

## TESTOVI ČUVARI
- jest: `normalize_place` (idempotentnost, sinonimi).
- test:db: `*_country_code` FK/CHECK samo ISO vrednosti; backfill ne menja broj tura/troškova; nemapirani ostaju `null` (bez tihog gubitka).

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
