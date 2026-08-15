-- ─────────────────────────────────────────────────────────────────────────────
-- 0011 — KILOMETRAŽA vozača na događajima ture (polazak, stanice, granica).
--
-- trip_events dobija `km` (očitana kilometraža) i `stop_id` (veza ka stanici za
-- 'stop_arrival'). Enum event_type se proširuje: 'departure', 'stop_arrival'
-- ('border' već postoji). RLS NEPROMENJEN (postojeće events politike + 0009).
--
-- driver_update_trip_progress se proširuje p_start_odometer-om: 'departure' upisuje/
-- potvrđuje trips.start_odometer (event je istina) — vozač ne dira trips direktno.
-- ─────────────────────────────────────────────────────────────────────────────

-- Novi tipovi događaja (ADD VALUE se NE koristi u istoj transakciji — samo se dodaje).
alter type event_type add value if not exists 'departure';
alter type event_type add value if not exists 'stop_arrival';
alter type event_type add value if not exists 'border';   -- već postoji; no-op

alter table trip_events add column if not exists km numeric;
alter table trip_events add column if not exists stop_id uuid
  references public.trip_stops(id) on delete set null;

-- RPC: dodat p_start_odometer (departure). Menja se potpis -> drop pa create.
drop function if exists driver_update_trip_progress(uuid, trip_status, integer);
create or replace function driver_update_trip_progress(
  p_trip_id uuid,
  p_status trip_status default null,
  p_end_odometer integer default null,
  p_start_odometer integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_vehicle uuid;
begin
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
