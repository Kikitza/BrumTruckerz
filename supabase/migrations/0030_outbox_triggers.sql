-- ─────────────────────────────────────────────────────────────────────────────
-- 0030 — OUTBOX trigeri, prvi eventi (v2-2 kriška 1). ADR 0012 (PRIHVAĆENO).
--
-- KO UPISUJE (ADR 0012 §4, presuda): TRIGERI NA TABELAMA. Jedini način da se
-- pokriju OBA puta upisa — direktan RLS upis (trips/trip_stops/attachments idu
-- kroz owner politike) I upis kroz RPC (npr. ownerCreateTrip radi insert; budući
-- RPC-ovi ne moraju ništa da pamte). Trigeri su AFTER + SECURITY DEFINER (emit
-- helper zaobilazi RLS). Sve u ISTOJ transakciji sa poslovnom promenom.
--
-- Prvi eventi ove kriške: trip.created, driver.assigned, route.changed, document.uploaded.
-- (trip.status_changed / trip.completed / invoice.* / employment.* / reminder.due → kasnije kriške.)
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ trips: trip.created (INSERT) + driver.assigned (promena trojke na UPDATE) ═══
create or replace function public.tg_trips_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_outbox_event(
      'trip.created', 'trip', NEW.id, NEW.company_id,
      jsonb_build_object(
        'title', NEW.title, 'status', NEW.status,
        'driver_id', NEW.driver_id, 'vehicle_id', NEW.vehicle_id, 'trailer_id', NEW.trailer_id
      ));
  elsif TG_OP = 'UPDATE' then
    -- Promena „trojke" (vozač/kamion/prikolica) = (re)dodela.
    if NEW.driver_id  is distinct from OLD.driver_id
    or NEW.vehicle_id is distinct from OLD.vehicle_id
    or NEW.trailer_id is distinct from OLD.trailer_id then
      perform public.emit_outbox_event(
        'driver.assigned', 'trip', NEW.id, NEW.company_id,
        jsonb_build_object(
          'driver_id',  NEW.driver_id,  'prev_driver_id',  OLD.driver_id,
          'vehicle_id', NEW.vehicle_id, 'prev_vehicle_id', OLD.vehicle_id,
          'trailer_id', NEW.trailer_id, 'prev_trailer_id', OLD.trailer_id
        ));
    end if;
  end if;
  return null; -- AFTER trigger
end $$;

drop trigger if exists trips_outbox on public.trips;
create trigger trips_outbox after insert or update on public.trips
  for each row execute function public.tg_trips_outbox();

-- ═══ trip_stops: route.changed (INSERT/UPDATE/DELETE stanice) ═══
-- company_id nije na trip_stops → izvlači se iz trips. Kod CASCADE brisanja ture
-- (roditelj već obrisan) v_company je null → preskačemo (nema route.changed spama).
create or replace function public.tg_trip_stops_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
declare v_trip uuid; v_company uuid; v_stop uuid;
begin
  if TG_OP = 'DELETE' then
    v_trip := OLD.trip_id; v_stop := OLD.id;
  else
    v_trip := NEW.trip_id; v_stop := NEW.id;
  end if;
  select company_id into v_company from public.trips where id = v_trip;
  if v_company is null then return null; end if;
  perform public.emit_outbox_event(
    'route.changed', 'trip', v_trip, v_company,
    jsonb_build_object('op', lower(TG_OP), 'stop_id', v_stop));
  return null;
end $$;

drop trigger if exists trip_stops_outbox on public.trip_stops;
create trigger trip_stops_outbox after insert or update or delete on public.trip_stops
  for each row execute function public.tg_trip_stops_outbox();

-- ═══ attachments: document.uploaded (INSERT) ═══
create or replace function public.tg_attachments_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.emit_outbox_event(
    'document.uploaded', 'attachment', NEW.id, NEW.company_id,
    jsonb_build_object('trip_id', NEW.trip_id, 'expense_id', NEW.expense_id, 'kind', NEW.kind));
  return null;
end $$;

drop trigger if exists attachments_outbox on public.attachments;
create trigger attachments_outbox after insert on public.attachments
  for each row execute function public.tg_attachments_outbox();
