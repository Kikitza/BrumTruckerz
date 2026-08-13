-- 0002_multicurrency_audit.sql
-- Dogovorene izmene posle 0001:
--  A) MULTIVALUTA: vozač unosi ono što piše na računu (PLN/HUF/CZK/RSD...),
--     sistem čuva original + kurs + iznos u baznoj valuti firme.
--  B) AUDIT DOGAĐAJA: trip_events postaje append-only; ispravka = nova verzija,
--     stara vrednost ostaje u istoriji (ko/šta/kada + komentar). Bez UPDATE/DELETE.
--  C) push_tokens za opomene (cron -> Expo push).

-- ─────────────────────────────────────────────────────────────
-- A) EXPENSES: multivaluta
--    base_amount = original_amount * fx_rate  (računa KOD, nikad model/klijent slobodno)
-- ─────────────────────────────────────────────────────────────
alter table expenses rename column amount   to base_amount;
alter table expenses rename column currency to base_currency;

alter table expenses add column original_amount   numeric(12,2);
alter table expenses add column original_currency text;
alter table expenses add column fx_rate           numeric(14,6);
alter table expenses add column fx_rate_date      date;

-- postojeći redovi (ako ih ima): tretiraj kao već-u-baznoj
update expenses
   set original_amount   = base_amount,
       original_currency = base_currency,
       fx_rate           = 1,
       fx_rate_date      = occurred_at::date
 where original_amount is null;

alter table expenses alter column original_amount   set not null;
alter table expenses alter column original_currency set not null;

comment on column expenses.original_amount   is 'Iznos kako piše na računu';
comment on column expenses.original_currency is 'Valuta računa (ISO 4217)';
comment on column expenses.fx_rate           is 'Kurs original->bazna na fx_rate_date (1 kad su iste)';
comment on column expenses.base_amount       is 'original_amount * fx_rate, u baznoj valuti firme';

-- refresh_driver_month referiše kolonu TEKSTUALNO u plpgsql telu -> mora recreate
create or replace function refresh_driver_month(p_company uuid, p_driver uuid, p_ym date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into driver_month_rollup as r
    (company_id, driver_id, year_month, trips_count, total_km, total_fuel_l,
     total_revenue, total_cost, total_profit, expected_fuel_l)
  select
    p_company, p_driver, p_ym,
    count(*),
    coalesce(sum(t.end_odometer - t.start_odometer), 0),
    coalesce(sum(x.fuel_l), 0),
    coalesce(sum(t.revenue), 0),
    coalesce(sum(coalesce(x.exp_total,0) + coalesce(t.driver_pay,0)), 0),
    coalesce(sum(t.revenue - (coalesce(x.exp_total,0) + coalesce(t.driver_pay,0))), 0),
    coalesce(sum(v.norm_consumption/100.0 * (t.end_odometer - t.start_odometer)), 0)
  from trips t
  join vehicles v on v.id = t.vehicle_id
  left join (
    select trip_id,
           sum(base_amount) as exp_total,
           sum(case when category='fuel' then coalesce(liters,0) else 0 end) as fuel_l
    from expenses group by trip_id
  ) x on x.trip_id = t.id
  where t.company_id = p_company
    and t.driver_id  = p_driver
    and t.status     = 'finished'
    and t.finished_at is not null
    and date_trunc('month', t.finished_at)::date = p_ym
  on conflict (company_id, driver_id, year_month) do update set
    trips_count     = excluded.trips_count,
    total_km        = excluded.total_km,
    total_fuel_l    = excluded.total_fuel_l,
    total_revenue   = excluded.total_revenue,
    total_cost      = excluded.total_cost,
    total_profit    = excluded.total_profit,
    expected_fuel_l = excluded.expected_fuel_l;
end $$;

-- trip_pnl je view (vezan po koloni, rename ga ne lomi) — recreate radi čitljivosti definicije
create or replace view trip_pnl with (security_invoker = on) as
  select
    t.id           as trip_id,
    t.company_id,
    t.driver_id,
    t.vehicle_id,
    (t.end_odometer - t.start_odometer)                            as total_km,
    t.revenue                                                      as revenue,
    coalesce(e.expenses_total, 0)                                  as expenses_total,
    coalesce(t.driver_pay, 0)                                      as driver_pay,
    coalesce(e.expenses_total,0) + coalesce(t.driver_pay,0)        as cost,
    t.revenue - (coalesce(e.expenses_total,0)+coalesce(t.driver_pay,0)) as profit,
    coalesce(e.fuel_liters, 0)                                     as fuel_liters,
    case when (t.end_odometer - t.start_odometer) > 0
         then round(coalesce(e.fuel_liters,0)/(t.end_odometer-t.start_odometer)*100, 2) end
                                                                   as consumption_l_per_100,
    case when (t.end_odometer - t.start_odometer) > 0
         then round((t.revenue-(coalesce(e.expenses_total,0)+coalesce(t.driver_pay,0)))
                    /(t.end_odometer-t.start_odometer), 2) end
                                                                   as profit_per_km
  from trips t
  left join (
    select trip_id,
           sum(base_amount)                                           as expenses_total,
           sum(case when category='fuel' then coalesce(liters,0) else 0 end) as fuel_liters
    from expenses group by trip_id
  ) e on e.trip_id = t.id;

-- ─────────────────────────────────────────────────────────────
-- B) TRIP_EVENTS: append-only + verzije + audit
-- ─────────────────────────────────────────────────────────────
alter table trip_events add column version             integer not null default 1;
alter table trip_events add column is_current          boolean not null default true;
alter table trip_events add column supersedes_event_id uuid references trip_events(id);
alter table trip_events add column edit_comment        text;
alter table trip_events add column created_by          uuid references app_users(id) default auth.uid();

create index on trip_events (trip_id, is_current);

comment on column trip_events.is_current   is 'false = zamenjeno novom verzijom (istorija ostaje)';
comment on column trip_events.edit_comment is 'Razlog/komentar ispravke (na novoj verziji)';

-- stare politike su dozvoljavale UPDATE/DELETE -> ukidamo; ostaju SELECT + INSERT.
drop policy if exists events_owner  on trip_events;
drop policy if exists events_driver on trip_events;

create policy events_select_owner on trip_events for select using (
  current_role_name()='platform_admin'
  or (company_id = current_company_id() and current_role_name()='owner')
);
create policy events_select_driver on trip_events for select using (
  current_role_name()='driver' and company_id = current_company_id()
  and exists (select 1 from trips t where t.id = trip_id and t.driver_id = current_driver_id())
);
create policy events_insert_owner on trip_events for insert with check (
  current_role_name()='platform_admin'
  or (company_id = current_company_id() and current_role_name()='owner')
);
create policy events_insert_driver on trip_events for insert with check (
  current_role_name()='driver' and company_id = current_company_id()
  and exists (select 1 from trips t where t.id = trip_id and t.driver_id = current_driver_id())
);
-- NEMA update/delete politika => niko (osim service role) ne menja istoriju direktno.

-- Ispravka isključivo kroz RPC: nova verzija + stara ostaje (ko/šta/kada + komentar).
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

  allowed :=
    current_role_name() = 'platform_admin'
    or (old_row.company_id = current_company_id() and current_role_name() = 'owner')
    or (current_role_name() = 'driver'
        and exists (select 1 from trips t
                     where t.id = old_row.trip_id and t.driver_id = current_driver_id()));
  if not allowed then raise exception 'Nije dozvoljeno'; end if;

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
grant execute on function correct_trip_event(uuid, event_type, timestamptz, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- C) PUSH TOKENI (Expo) — za cron opomene o rokovima
-- ─────────────────────────────────────────────────────────────
create table push_tokens (
  user_id    uuid not null references app_users(id) on delete cascade,
  token      text not null,
  platform   text,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table push_tokens enable row level security;
create policy push_own on push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
