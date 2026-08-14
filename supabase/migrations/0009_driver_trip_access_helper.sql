-- ─────────────────────────────────────────────────────────────────────────────
-- 0009 — Popravka RLS bug-a u SVIM driver policy-jima koje referišu baznu `trips`.
--
-- BUG (potvrđeno impersonacijom na DEV-u): izraz `exists (select 1 from trips t ...)`
-- unutar policy-ja se za VOZAČA izvršava pod NJEGOVIM RLS-om, a vozač nema select na
-- baznu `trips` (pravilo #2) → podupit vraća 0 redova → `exists` je UVEK false →
-- vozačev insert/select na attachments/expenses/trip_events i upload/read u Storage
-- su padali. (Ista klasa kao driver_trips: rešava se SECURITY DEFINER-om koji bypassuje
-- RLS iznutra — vraća samo boolean o pristupu POZIVAOCA, bez curenja podataka.)
--
-- FIX: helper public.driver_can_access_trip(text) + sve driver policy prebačene na njega.
-- Owner policy se NE diraju (koriste company_id direktno; owner ionako čita trips).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.driver_can_access_trip(trip_segment text)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trips t
    where t.id::text = trip_segment
      and t.driver_id = current_driver_id()
  )
$$;

-- ── attachments (0001: attach_driver, for all) ──
drop policy if exists attach_driver on attachments;
create policy attach_driver on attachments for all
  using  (current_role_name()='driver' and company_id=current_company_id()
          and public.driver_can_access_trip(trip_id::text))
  with check (current_role_name()='driver' and company_id=current_company_id()
          and public.driver_can_access_trip(trip_id::text));

-- ── expenses (0001: expenses_driver, for all) ──
drop policy if exists expenses_driver on expenses;
create policy expenses_driver on expenses for all
  using  (current_role_name()='driver' and company_id=current_company_id()
          and public.driver_can_access_trip(trip_id::text))
  with check (current_role_name()='driver' and company_id=current_company_id()
          and public.driver_can_access_trip(trip_id::text));

-- ── trip_events (0002: split na select+insert; append-only, bez update/delete) ──
drop policy if exists events_select_driver on trip_events;
create policy events_select_driver on trip_events for select using (
  current_role_name()='driver' and company_id=current_company_id()
  and public.driver_can_access_trip(trip_id::text)
);
drop policy if exists events_insert_driver on trip_events;
create policy events_insert_driver on trip_events for insert with check (
  current_role_name()='driver' and company_id=current_company_id()
  and public.driver_can_access_trip(trip_id::text)
);

-- ── storage.objects (0008: prilozi_driver_read/write; drugi segment putanje = tura) ──
drop policy if exists prilozi_driver_read on storage.objects;
create policy prilozi_driver_read on storage.objects for select to authenticated
  using (
    bucket_id = 'prilozi'
    and public.current_role_name() = 'driver'
    and public.driver_can_access_trip((storage.foldername(name))[2])
  );
drop policy if exists prilozi_driver_write on storage.objects;
create policy prilozi_driver_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prilozi'
    and public.current_role_name() = 'driver'
    and public.driver_can_access_trip((storage.foldername(name))[2])
  );
