-- ─────────────────────────────────────────────────────────────────────────────
-- 0027 — KARIJERNI PROFIL RADNIKA (v2-1). READ-ONLY, iz POSTOJEĆIH podataka.
--
-- CV vozača/dispečera iz stvarnog rada: istorija zaposlenja (employments),
-- zbirne brojke i km po mesecu (driver_month_rollup — završene ture po finished_at).
-- BEZ GPS-a, BEZ „zemlje kroz koje je vozio" (to je naredna kriška: nov podatak ruta→zemlja).
--
-- Nema izmena šeme (samo funkcije). Sve SECURITY DEFINER → autorizacija je EKSPLICITNA
-- (bypass RLS), po obrascu current_*/correct_trip_event:
--   * 'self'    — radnik gleda SVOJ CV (sve firme kroz istoriju);
--   * 'company' — office (owner|dispatcher) gleda radnika SVOJE firme → SAMO podaci te firme
--                 (ne vidi šta je radnik radio u drugim firmama — privatnost / data-collision duh);
--   * 'none'    — zabranjeno (izuzetak).
-- p_user = null → tumači se kao auth.uid() (moj CV).
-- ─────────────────────────────────────────────────────────────────────────────

-- Režim pristupa CV-u ciljanog korisnika (self | company | none).
create or replace function public.career_view_mode(p_user uuid)
  returns text
  language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_user, auth.uid()) = auth.uid() then 'self'
    when public.is_office_role() and exists (
      select 1 from employments e
       where e.user_id = coalesce(p_user, auth.uid())
         and e.company_id = public.current_company_id()
    ) then 'company'
    else 'none'
  end
$$;
grant execute on function public.career_view_mode(uuid) to authenticated;

-- Zaglavlje CV-a: javni broj (BT-D / BT-T po potrebi) + ime (profil → fallback drivers.full_name).
create or replace function public.career_header(p_user uuid default null)
  returns table (public_no text, display_name text)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid());
begin
  if public.career_view_mode(u) = 'none' then
    raise exception 'Nije dozvoljeno' using errcode = '42501';
  end if;
  return query
    select
      coalesce((select dp.public_no    from driver_profiles     dp where dp.user_id = u),
               (select xp.public_no    from dispatcher_profiles xp where xp.user_id = u)),
      coalesce((select dp.display_name from driver_profiles     dp where dp.user_id = u),
               (select xp.display_name from dispatcher_profiles xp where xp.user_id = u),
               (select d.full_name from drivers d where d.user_id = u order by d.created_at limit 1));
end $$;
grant execute on function public.career_header(uuid) to authenticated;

-- Zbirne brojke: ukupno km + broj (završenih) tura iz rollup-a; broj firmi + staž iz zaposlenja.
create or replace function public.career_summary(p_user uuid default null)
  returns table (total_km bigint, trips_count bigint, companies_count integer, tenure_days integer)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); mode text; comp uuid := public.current_company_id();
begin
  mode := public.career_view_mode(u);
  if mode = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
    select
      (select coalesce(sum(r.total_km), 0)::bigint
         from driver_month_rollup r join drivers d on d.id = r.driver_id
        where d.user_id = u and (mode = 'self' or r.company_id = comp)),
      (select coalesce(sum(r.trips_count), 0)::bigint
         from driver_month_rollup r join drivers d on d.id = r.driver_id
        where d.user_id = u and (mode = 'self' or r.company_id = comp)),
      (select count(distinct e.company_id)::integer
         from employments e where e.user_id = u and (mode = 'self' or e.company_id = comp)),
      (select coalesce(sum((coalesce(e.ended_at, current_date) - e.started_at) + 1), 0)::integer
         from employments e where e.user_id = u and (mode = 'self' or e.company_id = comp));
end $$;
grant execute on function public.career_summary(uuid) to authenticated;

-- Istorija zaposlenja (firma + period od–do + uloga + status). Office vidi SAMO svoju firmu.
create or replace function public.career_employments(p_user uuid default null)
  returns table (company_id uuid, company_name text, role_on_company text,
                 started_at date, ended_at date, status text)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); mode text; comp uuid := public.current_company_id();
begin
  mode := public.career_view_mode(u);
  if mode = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
    select e.company_id, c.name, e.role_on_company, e.started_at, e.ended_at, e.status
      from employments e join companies c on c.id = e.company_id
     where e.user_id = u and (mode = 'self' or e.company_id = comp)
     order by e.started_at desc, e.ended_at desc nulls first;
end $$;
grant execute on function public.career_employments(uuid) to authenticated;

-- Serija km po mesecu (za grafikon). Sabrano po firmama za self; jedna firma za office.
create or replace function public.career_km_series(p_user uuid default null)
  returns table (year_month date, total_km bigint, trips_count integer)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); mode text; comp uuid := public.current_company_id();
begin
  mode := public.career_view_mode(u);
  if mode = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
    select r.year_month, sum(r.total_km)::bigint, sum(r.trips_count)::integer
      from driver_month_rollup r join drivers d on d.id = r.driver_id
     where d.user_id = u and (mode = 'self' or r.company_id = comp)
     group by r.year_month
     order by r.year_month;
end $$;
grant execute on function public.career_km_series(uuid) to authenticated;
