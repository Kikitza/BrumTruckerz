-- ─────────────────────────────────────────────────────────────────────────────
-- 0014 — PLATFORM ADMIN (naplata/paketi/status firmi).
--
-- Rola 'platform_admin' već postoji (enum, 0001) i figurira u nekim politikama.
-- Ovde: (A) constraint na app_users.company_id; (B) status/paid_until/billing_note na
-- companies; (C) admin GUBI direktan RLS pristup POSLOVNOM/FINANSIJSKOM sadržaju firmi
-- (trips/expenses/trip_events/attachments/rollup → i security_invoker pogledi trip_pnl/
-- driver_performance time postaju prazni za admina); (D) 3 RPC-a (security definer) —
-- JEDINI put admina do meta-podataka firmi. Fleet (vehicles/trailers/drivers/reminders)
-- meta ostaje vidljiv adminu (to su brojke koje admin_list ionako prikazuje).
-- ─────────────────────────────────────────────────────────────────────────────

-- (A) company_id je null SAMO za platform_admin.
alter table app_users
  add constraint app_users_company_by_role
  check (role = 'platform_admin' or company_id is not null);

-- (B) companies: status + naplata.
alter table companies add column if not exists status       text not null default 'active'
  check (status in ('active','suspended'));
alter table companies add column if not exists paid_until   date;
alter table companies add column if not exists billing_note text;

-- (C) Skini platform_admin sa POSLOVNOG/FINANSIJSKOG sadržaja (owner ostaje isti).
drop policy if exists trips_owner on trips;
create policy trips_owner on trips for all
  using  (company_id = current_company_id() and current_role_name() = 'owner')
  with check (company_id = current_company_id() and current_role_name() = 'owner');

drop policy if exists expenses_owner on expenses;
create policy expenses_owner on expenses for all
  using  (company_id = current_company_id() and current_role_name() = 'owner')
  with check (company_id = current_company_id() and current_role_name() = 'owner');

drop policy if exists events_owner on trip_events;
create policy events_owner on trip_events for all
  using  (company_id = current_company_id() and current_role_name() = 'owner')
  with check (company_id = current_company_id() and current_role_name() = 'owner');

drop policy if exists attach_owner on attachments;
create policy attach_owner on attachments for all
  using  (company_id = current_company_id() and current_role_name() = 'owner')
  with check (company_id = current_company_id() and current_role_name() = 'owner');

drop policy if exists rollup_tenant on driver_month_rollup;
create policy rollup_tenant on driver_month_rollup for select
  using  (company_id = current_company_id() and current_role_name() = 'owner');

-- (D) RPC-ovi: SAMO platform_admin (security definer bypassuje RLS; provera role je eksplicitna).
create or replace function public.admin_list_companies()
  returns table (
    id uuid, name text, plan text, vehicle_limit int, vehicles_used int, drivers_used int,
    owner_emails text, status text, paid_until date, billing_note text, created_at timestamptz
  )
  language plpgsql stable security definer set search_path = public as $$
begin
  if current_role_name() <> 'platform_admin' then
    raise exception 'Samo platform_admin' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.plan, c.vehicle_limit,
      (select count(*)::int from vehicles v where v.company_id = c.id),
      (select count(*)::int from drivers d where d.company_id = c.id),
      (select string_agg(u.email, ', ') from app_users au join auth.users u on u.id = au.id
        where au.company_id = c.id and au.role = 'owner'),
      c.status, c.paid_until, c.billing_note, c.created_at
    from companies c
    order by c.created_at desc;
end $$;

create or replace function public.admin_set_company_plan(p_company_id uuid, p_plan text, p_vehicle_limit int)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if current_role_name() <> 'platform_admin' then
    raise exception 'Samo platform_admin' using errcode = '42501';
  end if;
  if p_vehicle_limit is null or p_vehicle_limit < 0 then raise exception 'Nevažeći limit'; end if;
  update companies set plan = coalesce(nullif(trim(p_plan), ''), plan), vehicle_limit = p_vehicle_limit
   where id = p_company_id;
  if not found then raise exception 'Firma ne postoji'; end if;
end $$;

create or replace function public.admin_set_company_status(p_company_id uuid, p_status text, p_paid_until date, p_billing_note text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if current_role_name() <> 'platform_admin' then
    raise exception 'Samo platform_admin' using errcode = '42501';
  end if;
  if p_status not in ('active','suspended') then raise exception 'Nevažeći status'; end if;
  update companies set status = p_status, paid_until = p_paid_until, billing_note = p_billing_note
   where id = p_company_id;
  if not found then raise exception 'Firma ne postoji'; end if;
end $$;

grant execute on function public.admin_list_companies() to authenticated;
grant execute on function public.admin_set_company_plan(uuid, text, int) to authenticated;
grant execute on function public.admin_set_company_status(uuid, text, date, text) to authenticated;
