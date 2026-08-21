-- ─────────────────────────────────────────────────────────────────────────────
-- 0028 — GEOGRAFIJA TURE → CV „Zemlje kroz koje je vozio" (v2-1b).
--
-- Svaka geo-tačka ture dobija ZEMLJU (ISO, odvojeno polje — data-collision guard §6):
--   * trip_stops.country_code  — zemlja svake stanice (utovar/istovar);
--   * trips.origin_country_code — zemlja polaznog mesta (origin je tekst na trips, NIJE stanica).
-- Destinacija = poslednji istovar (trip_stop) → njena zemlja je već u trip_stops.
-- country_source ('auto'|'manual'|null): da li je pogodila aplikacija ili potvrdio čovek.
-- POSTOJEĆE ture ostaju NULL (legalno; CV pokazuje samo poznato).
-- ─────────────────────────────────────────────────────────────────────────────

alter table trip_stops
  add column if not exists country_code   text references countries(code),
  add column if not exists country_source text check (country_source in ('auto','manual'));

alter table trips
  add column if not exists origin_country_code   text references countries(code),
  add column if not exists origin_country_source text check (origin_country_source in ('auto','manual'));

-- ─────────────────────────────────────────────────────────────
-- CV: distinct zemlje kroz koje je radnik vozio (origin + stanice), sa brojem tura po zemlji.
-- Autorizacija/skoping IDENTIČNI ostalim career_* RPC-ovima (self = sve firme; company = svoja firma).
-- ─────────────────────────────────────────────────────────────
create or replace function public.career_countries(p_user uuid default null)
  returns table (country_code text, name_key text, trips_count integer)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); mode text; comp uuid := public.current_company_id();
begin
  mode := public.career_view_mode(u);
  if mode = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
  with pts as (
    select ts.country_code as cc, t.id as trip_id, t.driver_id, t.company_id
      from trip_stops ts join trips t on t.id = ts.trip_id
     where ts.country_code is not null
    union all
    select t.origin_country_code, t.id, t.driver_id, t.company_id
      from trips t where t.origin_country_code is not null
  )
  select p.cc, c.name_key, count(distinct p.trip_id)::integer
    from pts p
    join drivers   d on d.id = p.driver_id and d.user_id = u
    join countries c on c.code = p.cc
   where (mode = 'self' or p.company_id = comp)
   group by p.cc, c.name_key, c.sort
   order by count(distinct p.trip_id) desc, c.sort, p.cc;
end $$;
grant execute on function public.career_countries(uuid) to authenticated;
