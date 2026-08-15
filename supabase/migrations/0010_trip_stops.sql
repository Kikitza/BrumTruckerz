-- ─────────────────────────────────────────────────────────────────────────────
-- 0010 — STANICE ture (više utovara/istovara).
--
-- Tura ima uređen niz stanica (seq): utovari i istovari. trips.origin ostaje
-- polazno mesto, trips.destination = mesto POSLEDNJEG istovara (kompatibilnost,
-- stare ture bez stanica rade kao do sada).
--
-- Company pripadnost se izvodi PREKO trips (bez nove kolone company_id).
-- RLS (ista klasa kao 0009):
--   * owner: pun CRUD u svojoj firmi — exists(trips ...) radi jer owner čita trips;
--     za VOZAČA taj exists vraća 0 (pravilo #2: vozač ne čita bazne trips) pa owner
--     policy ne curi na vozača.
--   * vozač: SAMO SELECT za svoje ture — kroz SECURITY DEFINER helper
--     public.driver_can_access_trip(text) (bypass RLS iznutra, vraća boolean).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.trip_stops (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  seq        int  not null,
  kind       text not null check (kind in ('loading','unloading')),
  place      text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists trip_stops_trip_seq_idx on public.trip_stops (trip_id, seq);

alter table public.trip_stops enable row level security;

-- Owner: pun CRUD u svojoj firmi (company preko trips).
drop policy if exists trip_stops_owner on public.trip_stops;
create policy trip_stops_owner on public.trip_stops for all
  using (
    current_role_name() = 'platform_admin'
    or (current_role_name() = 'owner'
        and exists (select 1 from public.trips t
                    where t.id = trip_id and t.company_id = current_company_id()))
  )
  with check (
    current_role_name() = 'platform_admin'
    or (current_role_name() = 'owner'
        and exists (select 1 from public.trips t
                    where t.id = trip_id and t.company_id = current_company_id()))
  );

-- Vozač: SAMO SELECT za svoje ture (helper bypassuje RLS-subupit zamku).
drop policy if exists trip_stops_driver_select on public.trip_stops;
create policy trip_stops_driver_select on public.trip_stops for select
  using (
    current_role_name() = 'driver'
    and public.driver_can_access_trip(trip_id::text)
  );
