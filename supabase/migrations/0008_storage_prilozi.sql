-- ─────────────────────────────────────────────────────────────────────────────
-- 0008 — Skladište priloga = Supabase Storage (privatan bucket 'prilozi').
-- Zamena za Cloudflare R2: storage_key ostaje agnostičan (company_id/trip_id/uuid.jpg),
-- pa je R2 moguća kasnija optimizacija bez migracije podataka.
--
-- Politike na storage.objects su u duhu attach_owner/attach_driver (0001):
--   * owner: čita i upisuje kad je PRVI segment putanje NJEGOVA firma (current_company_id);
--   * vozač: čita i upisuje SAMO kad je DRUGI segment putanje NJEGOVA tura;
--   * DELETE ne dobija niko (siročići svesno ostaju — ista MVP odluka kao dosad).
-- (RLS na storage.objects je već uključen od strane Supabase-a; ne diramo ga.)
-- ─────────────────────────────────────────────────────────────────────────────

-- Privatan bucket
insert into storage.buckets (id, name, public)
values ('prilozi', 'prilozi', false)
on conflict (id) do nothing;

-- ── OWNER: pun pristup fajlovima svoje firme (prvi segment = company_id) ──
create policy prilozi_owner_read on storage.objects for select to authenticated
  using (
    bucket_id = 'prilozi'
    and public.current_role_name() = 'owner'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

create policy prilozi_owner_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prilozi'
    and public.current_role_name() = 'owner'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

-- ── VOZAČ: pristup SAMO fajlovima svoje ture (drugi segment = trip_id njegove ture) ──
-- Provera preko public.trips (isto kao attach_driver); poredimo t.id::text sa segmentom
-- da nikad ne kastujemo neproverem tekst putanje u uuid.
create policy prilozi_driver_read on storage.objects for select to authenticated
  using (
    bucket_id = 'prilozi'
    and public.current_role_name() = 'driver'
    and exists (
      select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[2]
        and t.driver_id = public.current_driver_id()
    )
  );

create policy prilozi_driver_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prilozi'
    and public.current_role_name() = 'driver'
    and exists (
      select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[2]
        and t.driver_id = public.current_driver_id()
    )
  );
