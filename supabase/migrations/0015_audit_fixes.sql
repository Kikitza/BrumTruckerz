-- ─────────────────────────────────────────────────────────────────────────────
-- 0015 — Ispravke visokih nalaza audita (A1–A3). Sve na DEV; PROD nedirnut.
--
-- A1: 0014 je greškom rekreirao `events_owner … FOR ALL` na trip_events, čime je
--     vlasnik vratio UPDATE/DELETE nad append-only dnevnikom (pravilo #3). Vraćamo
--     append-only iz 0002 → ostaju SAMO events_select_owner + events_insert_owner.
-- A2: events_select_owner/events_insert_owner (iz 0002) su počinjali sa
--     `current_role_name()='platform_admin' or …` → admin je i dalje čitao/upisivao
--     dnevnik SVIH firmi. Rekreiramo ih BEZ platform_admin grane. Isto važi za
--     correct_trip_event RPC (jedini preostali admin-upis u dnevnik) → skidamo admin.
-- A3: Obustava firme (companies.status) do sada nije imala oslonac u bazi (samo
--     klijentski redirect). Uvodimo SECURITY DEFINER helper company_is_active() i
--     RESTRICTIVE write-gate politike: INSERT/UPDATE/DELETE na poslovnim tabelama
--     traže da je firma 'active'. SELECT OSTAJE dozvoljen pri obustavi (odluka
--     vlasnika proizvoda: naplata pritiska, ali ne drži podatke kao taoce).
--     platform_admin je izuzet iz gate-a (upravlja globalno). Write-putanje koje
--     zaobilaze RLS (SECURITY DEFINER RPC) dobijaju eksplicitnu proveru.
--
-- Restrictive politike se AND-uju sa postojećim permissive politikama i vezuju se
-- po komandi (insert/update/delete), pa SELECT ostaje netaknut.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Helper: da li je firma aktivna (fail-closed: nepostojeća firma => false) ──
-- SECURITY DEFINER da i vozač (koji nema select na companies) može da se proveri
-- bez curenja podataka — vraća samo boolean.
create or replace function public.company_is_active(cid uuid)
  returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'active' from companies where id = cid), false)
$$;
grant execute on function public.company_is_active(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- A1 — vrati append-only na trip_events (skini FOR ALL iz 0014)
-- ─────────────────────────────────────────────────────────────
drop policy if exists events_owner on trip_events;

-- ─────────────────────────────────────────────────────────────
-- A2 — admin gubi čitanje i upis dnevnika (bez platform_admin grane)
-- ─────────────────────────────────────────────────────────────
drop policy if exists events_select_owner on trip_events;
create policy events_select_owner on trip_events for select using (
  company_id = current_company_id() and current_role_name() = 'owner'
);

drop policy if exists events_insert_owner on trip_events;
create policy events_insert_owner on trip_events for insert with check (
  company_id = current_company_id() and current_role_name() = 'owner'
);
-- events_select_driver / events_insert_driver (0009) nemaju admin granu — ne diramo.

-- ─────────────────────────────────────────────────────────────
-- A3 — RESTRICTIVE write-gate: INSERT/UPDATE/DELETE traže aktivnu firmu.
--       SELECT nije gate-ovan (nema restrictive za select).
--       Gate izraz: admin je izuzet; inače firma mora biti 'active'.
-- ─────────────────────────────────────────────────────────────

-- Tabele sa kolonom company_id (gate po NEW/OLD.company_id).
--   trips
create policy trips_active_insert on trips as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy trips_active_update on trips as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy trips_active_delete on trips as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   trip_events (append-only → gate-ujemo samo INSERT; UPDATE/DELETE nemaju permissive politiku)
create policy events_active_insert on trip_events as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   expenses
create policy expenses_active_insert on expenses as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy expenses_active_update on expenses as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy expenses_active_delete on expenses as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   attachments
create policy attach_active_insert on attachments as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy attach_active_update on attachments as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy attach_active_delete on attachments as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   vehicles
create policy vehicles_active_insert on vehicles as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy vehicles_active_update on vehicles as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy vehicles_active_delete on vehicles as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   trailers
create policy trailers_active_insert on trailers as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy trailers_active_update on trailers as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy trailers_active_delete on trailers as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   drivers
create policy drivers_active_insert on drivers as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy drivers_active_update on drivers as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy drivers_active_delete on drivers as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   reminders
create policy reminders_active_insert on reminders as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy reminders_active_update on reminders as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy reminders_active_delete on reminders as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

--   trip_stops (NEMA company_id kolonu → gate po current_company_id())
create policy trip_stops_active_insert on trip_stops as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(current_company_id()));
create policy trip_stops_active_update on trip_stops as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(current_company_id()));
create policy trip_stops_active_delete on trip_stops as restrictive for delete
  using (current_role_name() = 'platform_admin' or company_is_active(current_company_id()));

--   storage.objects (bucket 'prilozi'): sprečava upload slika obustavljene firme.
--   Restrictive samo za prilozi INSERT; ostali bucketi/komande netaknuti.
create policy prilozi_active_write on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'prilozi'
    or current_role_name() = 'platform_admin'
    or company_is_active(current_company_id())
  );

-- ─────────────────────────────────────────────────────────────
-- A2 + A3 na SECURITY DEFINER write-putanjama (zaobilaze RLS → eksplicitna provera)
-- ─────────────────────────────────────────────────────────────

-- correct_trip_event: (A2) skini platform_admin granu; (A3) blokiraj pri obustavi.
create or replace function correct_trip_event(
  p_event_id    uuid,
  p_type        event_type  default null,
  p_occurred_at timestamptz default null,
  p_location    text        default null,
  p_note        text        default null,
  p_comment     text        default null   -- razlog ispravke (preporučeno)
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old_row trip_events%rowtype;
  new_id  uuid;
  allowed boolean;
begin
  select * into old_row from trip_events where id = p_event_id and is_current;
  if not found then raise exception 'Događaj ne postoji ili je već zamenjen novom verzijom'; end if;

  -- A2: BEZ platform_admin — admin ne ispravlja dnevnik firmi.
  allowed :=
    (old_row.company_id = current_company_id() and current_role_name() = 'owner')
    or (current_role_name() = 'driver'
        and exists (select 1 from trips t
                     where t.id = old_row.trip_id and t.driver_id = current_driver_id()));
  if not allowed then raise exception 'Nije dozvoljeno'; end if;

  -- A3: obustavljena firma ne menja podatke (upis je write).
  if not company_is_active(old_row.company_id) then
    raise exception 'COMPANY_SUSPENDED: firma je obustavljena' using errcode = '42501';
  end if;

  insert into trip_events
    (company_id, trip_id, type, occurred_at, location, note,
     version, is_current, supersedes_event_id, edit_comment, created_by)
  values
    (old_row.company_id, old_row.trip_id,
     coalesce(p_type, old_row.type),
     coalesce(p_occurred_at, old_row.occurred_at),
     coalesce(p_location, old_row.location),
     coalesce(p_note, old_row.note),
     old_row.version + 1, true, old_row.id, p_comment, auth.uid())
  returning id into new_id;

  update trip_events set is_current = false where id = old_row.id;
  return new_id;
end $$;

-- driver_update_trip_progress: (A3) blokiraj pri obustavi (vozačev write bypassuje RLS).
create or replace function driver_update_trip_progress(
  p_trip_id uuid,
  p_status trip_status default null,
  p_end_odometer integer default null,
  p_start_odometer integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_vehicle uuid;
begin
  if not company_is_active(current_company_id()) then
    raise exception 'COMPANY_SUSPENDED: firma je obustavljena' using errcode = '42501';
  end if;

  update trips
     set status         = coalesce(p_status, status),
         end_odometer   = coalesce(p_end_odometer, end_odometer),
         start_odometer = coalesce(p_start_odometer, start_odometer),
         finished_at    = case when p_status = 'finished' then now() else finished_at end
   where id = p_trip_id and driver_id = current_driver_id()
   returning vehicle_id into v_vehicle;

  if not found then raise exception 'Nije dozvoljeno ili tura ne postoji'; end if;

  -- ažuriraj kilometražu vozila (hrani km-rokove/servise) — i za start i za end
  if p_end_odometer is not null then
    update vehicles set current_odometer = greatest(current_odometer, p_end_odometer) where id = v_vehicle;
  end if;
  if p_start_odometer is not null then
    update vehicles set current_odometer = greatest(current_odometer, p_start_odometer) where id = v_vehicle;
  end if;
end $$;
