-- ─────────────────────────────────────────────────────────────────────────────
-- 0037 — PUN CV UZ IZRIČIT PRISTANAK (v2-3 kriška 3, ADR 0014). Završna marketplace v1.
--
-- Radnik do sada deli PUN CV samo sa firmama u kojima je zaposlen (career mode 'company' →
-- SAMO ta firma). Ova kriška: firma van zaposlenja može ZATRAŽITI pun CV; radnik EKSPLICITNO
-- ODOBRI (per-firma), i može OPOZVATI bilo kad → pristup se momentalno gasi.
--
-- MODEL (dve tabele — namerno razdvojeno, KVALITET #1):
--   * cv_consents  = LEDGER pristanaka (granted|revoked) — trajni trag „ko sme moj CV";
--   * cv_requests  = PRELAZNI zahtev (pending→approved|denied|cancelled) — „inbox" radnika.
-- Spajanje bi zamutilo audit (granted/revoked istorija) sa prolaznim zahtevom.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tabele ──────────────────────────────────────────────────────────────────
create table if not exists public.cv_consents (
  id             uuid primary key default gen_random_uuid(),
  worker_user_id uuid not null references app_users(id) on delete cascade,
  company_id     uuid not null references companies(id) on delete cascade,
  status         text not null default 'granted' check (status in ('granted','revoked')),
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  constraint cv_consents_status_ck
    check ((status = 'granted' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);
-- Jedinstven AKTIVAN pristanak po (radnik, firma).
create unique index if not exists cv_consents_active_uidx
  on public.cv_consents (worker_user_id, company_id) where status = 'granted';
create index if not exists cv_consents_company_idx on public.cv_consents (company_id, status);

create table if not exists public.cv_requests (
  id             uuid primary key default gen_random_uuid(),
  worker_user_id uuid not null references app_users(id) on delete cascade,
  company_id     uuid not null references companies(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  created_by     uuid references app_users(id) on delete set null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
-- Najviše JEDAN otvoren zahtev po (radnik, firma) → idempotentno „Zatraži CV".
create unique index if not exists cv_requests_pending_uidx
  on public.cv_requests (worker_user_id, company_id) where status = 'pending';
create index if not exists cv_requests_worker_idx  on public.cv_requests (worker_user_id, status);
create index if not exists cv_requests_company_idx on public.cv_requests (company_id, status);

-- ── RLS: radnik vidi SVOJE; office (read-only) vidi date SVOJOJ firmi; niko treći. ──
-- Upis ISKLJUČIVO kroz SECURITY DEFINER RPC-ove (obrazac accept_invitation/decline).
alter table public.cv_consents enable row level security;
drop policy if exists cv_consents_worker on public.cv_consents;
create policy cv_consents_worker on public.cv_consents for select using (worker_user_id = auth.uid());
drop policy if exists cv_consents_office on public.cv_consents;
create policy cv_consents_office on public.cv_consents for select
  using (public.is_office_role() and company_id = public.current_company_id());

alter table public.cv_requests enable row level security;
drop policy if exists cv_requests_worker on public.cv_requests;
create policy cv_requests_worker on public.cv_requests for select using (worker_user_id = auth.uid());
drop policy if exists cv_requests_office on public.cv_requests;
create policy cv_requests_office on public.cv_requests for select
  using (public.is_office_role() and company_id = public.current_company_id());

-- ── career_view_mode: dodat režim 'consented' (ISPRED 'company' — pristanak daje VIŠE). ──
create or replace function public.career_view_mode(p_user uuid)
  returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_user, auth.uid()) = auth.uid() then 'self'
    when public.is_office_role() and exists (
      select 1 from cv_consents cc
       where cc.worker_user_id = coalesce(p_user, auth.uid())
         and cc.company_id = public.current_company_id() and cc.status = 'granted'
    ) then 'consented'
    when public.is_office_role() and exists (
      select 1 from employments e
       where e.user_id = coalesce(p_user, auth.uid()) and e.company_id = public.current_company_id()
    ) then 'company'
    else 'none'
  end
$$;

-- ── career_* : 'consented' se ponaša kao 'self' (pun CV — sve firme). ────────────
-- (redefinicija 0027/0028 tela: `mode = 'self'` → `mode in ('self','consented')`.)
create or replace function public.career_header(p_user uuid default null)
  returns table (public_no text, display_name text)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid());
begin
  if public.career_view_mode(u) = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
    select
      coalesce((select dp.public_no    from driver_profiles     dp where dp.user_id = u),
               (select xp.public_no    from dispatcher_profiles xp where xp.user_id = u)),
      coalesce((select dp.display_name from driver_profiles     dp where dp.user_id = u),
               (select xp.display_name from dispatcher_profiles xp where xp.user_id = u),
               (select d.full_name from drivers d where d.user_id = u order by d.created_at limit 1));
end $$;

create or replace function public.career_summary(p_user uuid default null)
  returns table (total_km bigint, trips_count bigint, companies_count integer, tenure_days integer)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); mode text; comp uuid := public.current_company_id();
begin
  mode := public.career_view_mode(u);
  if mode = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
    select
      (select coalesce(sum(r.total_km), 0)::bigint from driver_month_rollup r join drivers d on d.id = r.driver_id
        where d.user_id = u and (mode in ('self','consented') or r.company_id = comp)),
      (select coalesce(sum(r.trips_count), 0)::bigint from driver_month_rollup r join drivers d on d.id = r.driver_id
        where d.user_id = u and (mode in ('self','consented') or r.company_id = comp)),
      (select count(distinct e.company_id)::integer from employments e
        where e.user_id = u and (mode in ('self','consented') or e.company_id = comp)),
      (select coalesce(sum((coalesce(e.ended_at, current_date) - e.started_at) + 1), 0)::integer from employments e
        where e.user_id = u and (mode in ('self','consented') or e.company_id = comp));
end $$;

create or replace function public.career_employments(p_user uuid default null)
  returns table (company_id uuid, company_name text, role_on_company text, started_at date, ended_at date, status text)
  language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); mode text; comp uuid := public.current_company_id();
begin
  mode := public.career_view_mode(u);
  if mode = 'none' then raise exception 'Nije dozvoljeno' using errcode = '42501'; end if;
  return query
    select e.company_id, c.name, e.role_on_company, e.started_at, e.ended_at, e.status
      from employments e join companies c on c.id = e.company_id
     where e.user_id = u and (mode in ('self','consented') or e.company_id = comp)
     order by e.started_at desc, e.ended_at desc nulls first;
end $$;

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
     where d.user_id = u and (mode in ('self','consented') or r.company_id = comp)
     group by r.year_month order by r.year_month;
end $$;

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
      from trip_stops ts join trips t on t.id = ts.trip_id where ts.country_code is not null
    union all
    select t.origin_country_code, t.id, t.driver_id, t.company_id
      from trips t where t.origin_country_code is not null
  )
  select p.cc, c.name_key, count(distinct p.trip_id)::integer
    from pts p join drivers d on d.id = p.driver_id and d.user_id = u
    join countries c on c.code = p.cc
   where (mode in ('self','consented') or p.company_id = comp)
   group by p.cc, c.name_key, c.sort
   order by count(distinct p.trip_id) desc, c.sort, p.cc;
end $$;

-- ── RPC-ovi toka (SECURITY DEFINER) ──────────────────────────────────────────

-- Office traži pun CV radnika → pending zahtev + event. Idempotentno.
create or replace function public.cv_request(p_worker uuid)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_id uuid;
begin
  if not public.is_office_role() then raise exception 'NOT_OFFICE' using errcode = '42501'; end if;
  if not public.company_is_active(v_company) then raise exception 'COMPANY_SUSPENDED' using errcode = '42501'; end if;
  -- Već ima aktivan pristanak → nema šta da traži.
  if exists (select 1 from cv_consents where worker_user_id = p_worker and company_id = v_company and status = 'granted') then
    return jsonb_build_object('status', 'already_granted');
  end if;
  -- Otvoren zahtev → vrati postojeći (idempotentno).
  select id into v_id from cv_requests where worker_user_id = p_worker and company_id = v_company and status = 'pending';
  if found then return jsonb_build_object('request_id', v_id, 'status', 'already_pending'); end if;

  insert into cv_requests (worker_user_id, company_id, created_by)
    values (p_worker, v_company, auth.uid()) returning id into v_id;
  perform public.emit_outbox_event('cv.request.sent', 'cv_request', v_id, v_company,
    jsonb_build_object('worker_user_id', p_worker));
  return jsonb_build_object('request_id', v_id, 'status', 'sent');
end $$;
grant execute on function public.cv_request(uuid) to authenticated;

-- Office: status odnosa sa radnikom za CV (granted|requested|none) — za mrežnu karticu.
create or replace function public.cv_access(p_worker uuid)
  returns text language sql stable security definer set search_path = public as $$
  select case
    when not public.is_office_role() then 'none'
    when exists (select 1 from cv_consents where worker_user_id = p_worker
                  and company_id = public.current_company_id() and status = 'granted') then 'granted'
    when exists (select 1 from cv_requests where worker_user_id = p_worker
                  and company_id = public.current_company_id() and status = 'pending') then 'requested'
    else 'none'
  end
$$;
grant execute on function public.cv_access(uuid) to authenticated;

-- Radnik: otvoreni zahtevi UPUĆENI njemu (firma + kad).
create or replace function public.my_cv_requests()
  returns table (request_id uuid, company_id uuid, company_name text, created_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select r.id, r.company_id, c.name, r.created_at
    from cv_requests r join companies c on c.id = r.company_id
   where r.worker_user_id = auth.uid() and r.status = 'pending'
   order by r.created_at desc;
$$;
grant execute on function public.my_cv_requests() to authenticated;

-- Radnik odgovara na zahtev: approve → pristanak granted (+ event); deny → samo zatvori.
create or replace function public.respond_cv_request(p_request uuid, p_approve boolean)
  returns void language plpgsql volatile security definer set search_path = public as $$
declare v_company uuid;
begin
  select company_id into v_company from cv_requests
   where id = p_request and worker_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'CV_REQUEST_NOT_FOUND' using errcode = '42704'; end if;

  update cv_requests set status = case when p_approve then 'approved' else 'denied' end, resolved_at = now()
   where id = p_request;

  if p_approve then
    -- Reaktiviraj opozvan ili upiši nov pristanak (jedinstven aktivan po radnik,firma).
    update cv_consents set status = 'granted', granted_at = now(), revoked_at = null
     where worker_user_id = auth.uid() and company_id = v_company and status = 'revoked';
    if not found then
      insert into cv_consents (worker_user_id, company_id) values (auth.uid(), v_company)
        on conflict do nothing;
    end if;
    perform public.emit_outbox_event('cv.consent.granted', 'cv_consent', p_request, v_company,
      jsonb_build_object('worker_user_id', auth.uid()));
  end if;
end $$;
grant execute on function public.respond_cv_request(uuid, boolean) to authenticated;

-- Radnik: firme sa AKTIVNIM pristankom („Ko vidi moj CV").
create or replace function public.my_cv_consents()
  returns table (company_id uuid, company_name text, granted_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select cc.company_id, c.name, cc.granted_at
    from cv_consents cc join companies c on c.id = cc.company_id
   where cc.worker_user_id = auth.uid() and cc.status = 'granted'
   order by cc.granted_at desc;
$$;
grant execute on function public.my_cv_consents() to authenticated;

-- Radnik OPOZIVA pristanak → momentalno gasi pristup (career_view_mode više nije 'consented').
create or replace function public.revoke_cv_consent(p_company uuid)
  returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update cv_consents set status = 'revoked', revoked_at = now()
   where worker_user_id = auth.uid() and company_id = p_company and status = 'granted';
  if not found then raise exception 'CV_CONSENT_NOT_FOUND' using errcode = '42704'; end if;
  perform public.emit_outbox_event('cv.consent.revoked', 'cv_consent', p_company, p_company,
    jsonb_build_object('worker_user_id', auth.uid()));
end $$;
grant execute on function public.revoke_cv_consent(uuid) to authenticated;
