# ADR 0012 — Event / Outbox sloj

**STATUS: PREDLOG** (22.8.2026). Jednosmerna vrata (⛩) — vlasnik potpisuje **pre** implementacije. Sledi posle v2-1 (karijerni profil), pre marketplace-a (MASTER-PLAN-v2 §49–58, PDF §8/§10).

## KONTEKST (danas u kodu)
- Poslovne promene se upisuju u tabele (trips, expenses, attachments, invoices…). **Kad se nešto desi, niko ne biva obavešten** osim ako ekran ručno ne osveži (React Query invalidacija). Kancelarija „gleda pa F5“.
- Dva puta upisa postoje već sada: **direktno kroz RLS** (npr. `trips` — owner insert/update) i **kroz RPC** (npr. `invoices`, `accept_invitation`, `driver_update_trip_progress`). Bilo koje rešenje mora pokriti **oba**.
- Marketplace, notifikacije i analitika (v2-3+) treba da **reaguju** na događaje (dodela ture, upload dokumenta). Bez zajedničkog sloja svaka bi izmislila svoju ad-hoc sinhronizaciju.
- Duh ADR 0011: **Postgres je dovoljan** na našoj skali; ne uvodimo spoljne sisteme dok ih baza nosi.

## ODLUKA (šta presuđujemo)
1. **Događaj = nepromenjiv zapis „desilo se“.** Imenovanje `domen.akcija`, `payload jsonb`, `event_version` za evoluciju šeme. Kanonski set v1 (usklađen sa PDF §8 i MASTER-PLAN §53): `trip.created`, `driver.assigned`, `route.changed`, `trip.status_changed`, `trip.completed`, `document.uploaded`, `expense.created`, `invoice.issued`, `invoice.paid`, `employment.started`, `employment.ended`, `reminder.due`.
2. **Outbox obrazac (temelj skale).** Event se upisuje **u ISTOJ transakciji** sa poslovnom promenom, u tabelu `outbox_events`. Ako transakcija prođe — event postoji; ako padne — nestaje sa promenom. **Nikad se ne gubi, nikad se ne šalje za nešto što se nije desilo.** Potrošači ga čitaju **asinhrono, kasnije**. Prostim jezikom: razdvajamo **„primi“** (brzo, u transakciji) od **„obradi“** (notifikacije/marketplace, van kritične putanje). To je temelj i skale i marketplace-a.
3. **Isporuka: at-least-once + idempotentan potrošač.** `idempotency_key` (jedinstven) sprečava dvostruku obradu ako potrošač pokuša dvaput. Potrošač MORA biti idempotentan (ponovljena obrada = isti rezultat).
4. **KO UPISUJE: trigeri na tabelama (osnova), eksplicitno samo za računate evente.** — v. „ODBAČENE ALTERNATIVE“.
5. **KO TROŠI (v1 minimalno):** (a) **Supabase Realtime** nad `outbox_events` → živa kancelarijska tabla (dispečer vidi promene bez osvežavanja); (b) **worker/cron** (pg_cron ili zakazana Edge funkcija) koji uzima neobrađene redove `FOR UPDATE SKIP LOCKED`, obradi, upiše `processed_at`; greška → `attempts+1`, `error`, retry; posle N pokušaja → dead-letter (ostaje neobrađen, vidljiv).
6. **`audit_log` (§11) = sestrinska tabela, ne isti red.** Outbox je **prolazni red za isporuku** (retencija: čisti se posle X dana kad je obrađen). Audit je **trajni ljudski dnevnik „ko je šta uradio“** (nepromenjiv, dugoročan, za usklađenost/GDPR). **Isti trigeri** pune obe — audit preživljava čišćenje outbox-a.
7. **Anti-scope v1:** NE radimo event sourcing (tabele OSTAJU izvor istine; outbox je samo tok obaveštavanja), NE gradimo replay infrastrukturu, NE uvodimo spoljni broker (Kafka i sl.).

## ODBAČENE ALTERNATIVE (sa razlogom)
1. **Eksplicitno emitovanje u svakom RPC-u (bez trigera).** Odbačeno kao *osnova*: promašuje **direktne RLS upise** (`trips` se piše mimo RPC-a) i traži da se svaki **budući** RPC seti da emituje — pokrivenost svih puteva nije garantovana. → Osnova su **AFTER trigeri na tabelama**: hvataju i RLS i RPC upis, u istoj transakciji, iz `NEW/OLD` + `auth.uid()` + `current_company_id()`. **Izuzetak:** računati/vremenski eventi bez originalnog upisa reda (`reminder.due` — računa ga cron) emituju se **eksplicitno** kod svog proizvođača. Time je pokriveno 100% puteva.
2. **Slanje notifikacije direktno iz transakcije (bez outbox-a).** Odbačeno: spoljni poziv u transakciji je spor i lomljiv (mreža padne → cela poslovna promena padne ili se blokira). Outbox razdvaja primi/obradi.
3. **Spoljni broker (Kafka/SQS/Redis).** Odbačeno za našu skalu (1–20 kamiona po firmi): operativni trošak i nova tajna/infra bez potrebe; Postgres `SKIP LOCKED` je dovoljan red. (Duh ADR 0011.)
4. **Event sourcing (eventi kao izvor istine).** Odbačeno: ogroman zaokret; naše tabele su i dalje istina, outbox je samo obaveštavanje.
5. **Realtime kao izvor istine.** Odbačeno: Realtime je **osvežavanje** (može propustiti poruku); istina se uvek čita iz baze. Realtime samo „gurne“ klijenta da povuče.

## SKICA ŠEME (indikativno — tačan SQL u migraciji)
```
outbox_events (
  id             uuid pk default gen_random_uuid(),
  occurred_at    timestamptz not null default now(),
  event_type     text not null,            -- 'trip.created' …
  event_version  int  not null default 1,  -- evolucija payload-a
  aggregate_type text not null,            -- 'trip' | 'invoice' | 'employment' …
  aggregate_id   uuid not null,
  company_id     uuid not null,            -- tenant izolacija (RLS)
  actor_user_id  uuid,                     -- ko je izazvao (auth.uid())
  payload        jsonb not null default '{}',
  idempotency_key text not null unique,    -- against dvostruke obrade
  processed_at   timestamptz,              -- null = neobrađen
  attempts       int not null default 0,
  error          text
)
-- indeksi:
--   partial (processed_at is null)             → brzo uzimanje neobrađenih
--   (company_id, occurred_at desc)             → realtime tabla po firmi
-- RLS: office role (owner/dispatcher) SELECT samo svoj company_id (za tablu);
--      INSERT isključivo kroz SECURITY DEFINER trigere; klijent nema insert/update/delete.
-- RETENCIJA: cron briše processed_at < now() - interval '30 days' (audit ostaje trajno).
```

## MIGRACIONI PUT (aditivno)
- **0029:** tabela `outbox_events` + indeksi + RLS (SELECT po firmi) + retencioni pomoćni RPC.
- **0030:** trigeri na `trips`/`trip_stops`/`attachments`/`invoices`/`employments` (+ eksplicitni emit u cron-u za `reminder.due`).
- **Bez diranja postojećih podataka.** Istorijske ture nemaju retroaktivne evente (legalno — outbox je „od sada“).
- **Prvi potrošač = jedna živa lista** (npr. lista tura u kancelariji koja se sama osvežava) kao dokaz kraj-na-kraj.
- Retencija/worker: pg_cron ili zakazana Edge funkcija (odluka pri implementaciji; obe su Postgres-domaće).

## TESTOVI ČUVARI (uslov za PRIHVAĆENO)
1. **Atomičnost:** poslovni upis + event u istoj transakciji; rollback poslovne promene ⇒ **nema** event reda (i obrnuto: uspeh ⇒ tačno jedan event).
2. **Pokrivenost oba puta:** direktan RLS upis (`trips`) **i** RPC upis (`invoices`) → oba proizvode event (test:db, impersonacija).
3. **Tenant izolacija:** firma A ne vidi `outbox_events` firme B (RLS), kao i ostatak RLS svite.
4. **Idempotencija potrošača:** dvostruka obrada istog `idempotency_key` ⇒ jedan efekat.
5. **Retry/dead-letter:** namerni pad potrošača ⇒ `attempts` raste, red ostaje neobrađen i vidljiv; nema tihog gubitka.
6. **Realtime ≠ istina:** propuštena Realtime poruka ne menja podatke; ponovno čitanje iz baze daje tačno stanje.
