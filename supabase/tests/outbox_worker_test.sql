-- ─────────────────────────────────────────────────────────────────────────────
-- Outbox WORKER (v2-2 kriška 3) test svita. Dokazuje claim/lease/dead-letter/prune
-- semantiku na nivou baze (handleri žive u Edge workeru; ovde se simulira odluka
-- worker-a: mark_processed / mark_error / dostignut MAX). Sve u JEDNOJ transakciji
-- koja se ROLLBACK-uje (sentinel raise) → strogo read-only nad DEV.
--
-- Napomena: prava PARALELNA bezbednost (FOR UPDATE SKIP LOCKED između dve sesije)
-- ne može se dokazati u jednoj transakciji; ovde se dokazuje LEASE (attempts+1 na
-- claim), isključivanje obrađenih, dead-letter isključivanje na MAX i ne-blokiranje.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c_a uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid();   -- uspeh → processed
  e2 uuid := gen_random_uuid();   -- ostaje živ (dokaz ne-blokiranja)
  eb uuid := gen_random_uuid();   -- dead-letter (dostigne MAX)
  eo uuid := gen_random_uuid();   -- star obrađen → prune ga briše
  n int; a1 int;
begin
  insert into companies (id, name, status) values (c_a, 'W', 'active');
  insert into outbox_events (id, event_type, aggregate_type, aggregate_id, company_id, payload, idempotency_key) values
    (e1, 'test.ok',   'test', e1, c_a, '{}', gen_random_uuid()::text),
    (e2, 'test.ok',   'test', e2, c_a, '{}', gen_random_uuid()::text),
    (eb, 'test.boom', 'test', eb, c_a, '{}', gen_random_uuid()::text);

  -- ═══ (1) CLAIM = LEASE: neobrađeni dobijaju attempts+1 ═══
  perform outbox_claim_batch(100000, 5);
  select attempts into a1 from outbox_events where id = e1;
  if a1 <> 1 then raise exception 'FAIL: claim nije lease-ovao e1 (attempts=% , očekivano 1)', a1; end if;

  -- ═══ (2) USPEH: mark_processed → processed_at set; NE claim-uje se ponovo ═══
  perform outbox_mark_processed(e1);
  if (select processed_at from outbox_events where id = e1) is null then
    raise exception 'FAIL: mark_processed nije postavio processed_at';
  end if;
  select count(*) into n from outbox_claim_batch(100000, 5) where id = e1;
  if n <> 0 then raise exception 'FAIL: obrađen e1 ponovo claim-ovan (mora 0)'; end if;

  -- ═══ (3) GREŠKA: mark_error zapiše poruku, red ostaje neobrađen (retry kandidat) ═══
  perform outbox_mark_error(eb, 'namerni pad handlera');
  if (select error from outbox_events where id = eb) is null then
    raise exception 'FAIL: mark_error nije zapisao poruku';
  end if;
  if (select processed_at from outbox_events where id = eb) is not null then
    raise exception 'FAIL: neuspeo eb ne sme biti processed';
  end if;

  -- ═══ (4) DEAD-LETTER: na MAX (5) claim ga ISKLJUČUJE; ostali (e2) i dalje teku ═══
  update outbox_events set attempts = 5 where id = eb;  -- simulira 5 iscrpljenih pokušaja
  select count(*) into n from outbox_claim_batch(100000, 5) where id = eb;
  if n <> 0 then raise exception 'FAIL: dead-letter eb (attempts>=MAX) i dalje claim-ovan'; end if;
  -- isti claim mora vratiti e2 (živ, attempts<MAX) → dead-letter ne blokira ostale
  select count(*) into n from outbox_claim_batch(100000, 5) where id = e2;
  if n <> 1 then raise exception 'FAIL: e2 nije claim-ovan uprkos dead-letter eb (ne-blokiranje) = %', n; end if;

  -- ═══ (5) RETENCIJA: prune briše STARE obrađene, čuva sveže/neobrađene ═══
  insert into outbox_events (id, event_type, aggregate_type, aggregate_id, company_id, payload, idempotency_key, processed_at)
    values (eo, 'test.ok', 'test', eo, c_a, '{}', gen_random_uuid()::text, now() - interval '40 days');
  perform outbox_prune(30);
  select count(*) into n from outbox_events where id = eo;
  if n <> 0 then raise exception 'FAIL: prune nije obrisao star obrađen event (40 dana)'; end if;
  select count(*) into n from outbox_events where id = e2;   -- neobrađen → mora ostati
  if n <> 1 then raise exception 'FAIL: prune obrisao neobrađen e2 (mora ostati)'; end if;

  raise exception 'ALL_OUTBOX_WORKER_TESTS_PASSED';
end $$;
