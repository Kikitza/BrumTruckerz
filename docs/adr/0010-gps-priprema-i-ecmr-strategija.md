# ADR 0010 — GPS priprema i e-CMR strategija

## KONTEKST (danas u kodu/šemi)
- **Nema GPS/lokacije** u šemi. Jedino „gde" su tekstualna mesta na turi/stanicama (ADR 0004) i km po događaju (`trip_events.km`, `0011`).
- Trojka vozač/truk/prikolica visi na **turi** i menja se po turi (`0001:86-107`, data-model §1) — pozicija u vremenu logično pripada baš toj trojci-u-turi.
- Pozicioniranje proizvoda: **„digitalna arhiva transportne dokumentacije"**; termin **eCMR se NE koristi** (pravno zaštićen; eFTI sertifikacija je kasnija faza) — dosledno u kodu i docs (audit §30, CLAUDE.md).
- MASTER-PLAN: GPS je **ZAMRZNUT** do provere regulativa; e-CMR/eFTI rok **9.7.2027**.

## ODLUKA
- **GPS ostaje ZAMRZNUT.** Kada se odmrzne (odlukom vlasnika): pozicija pripada **(uređaj + vozilo + tura) u vremenu**, u **odvojenom skladištu** (zaseban, particija-spreman trag), snima se **SAMO tokom ture**, **adaptivno** (retko u stajanju/češće u vožnji), bez namenskog hardvera; čuva se poslednja poznata lokacija. Uz **GDPR polja** (saglasnost, svrha, retencija).
- **e-CMR strategija:** do eFTI odluke ostajemo „digitalna arhiva" (bez tvrdnje o e-CMR/eFTI usklađenosti). Izbor **sopstveno vs partner-platforma** se donosi zasebnim ADR-om kad rok priđe; dizajn dokumenata (ADR 0007/0008) drži vrata otvorena za oba puta.
- **Odbačeno:** (a) 24/7 praćenje ljudi — pravni/etički rizik, van „samo tokom ture"; (b) GPS u `trip_events`/`trips` — meša retke poslovne događaje sa gustim tragom, kvari particionisanje; (c) reklamirati e-CMR sada — pravno zaštićeno, nezasluženo (audit §30).

## SKICA ŠEME (nacrt — NE gradi se sada)
```
trip_positions (zamrznuto, odvojeno skladište)
  id, company_id, trip_id, vehicle_id, device_id,
  captured_at timestamptz, lat, lon, accuracy, source,
  primary key (company_id, trip_id, captured_at)   -- particija-spremno po mesecu/tenantu
location_consents (GDPR)
  company_id, subject (driver profil), purpose, granted_at, revoked_at, retention_days
-- e-CMR: koristi generički attachments (ADR 0007) + invoices/trip meta; struktura ostaje otvorena
```

## MIGRACIONI PUT (bez prekida)
- Ništa se ne primenjuje dok GPS ne odmrzne vlasnik. Kad se odmrzne: aditivna migracija (`trip_positions`, `location_consents`); nema dodira postojećih tabela → nulti rizik po tekuće podatke. Staging → PROD uz odobrenje + GDPR politika/saglasnosti pre prvog snimanja.

## TESTOVI ČUVARI
- (kad se gradi) test:db: `trip_positions` RLS izolacija (firma A ≠ B); vozač vidi samo svoje; snimanje bez aktivne saglasnosti odbijeno.
- Doc-čuvar sada: grep-provera da se termin **eCMR/eFTI** ne pojavljuje kao tvrdnja usklađenosti (pozicioniranje „arhiva").

## STATUS: PRIHVAĆENO (potpisano 19.8.2026)
