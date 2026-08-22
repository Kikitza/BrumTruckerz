-- ─────────────────────────────────────────────────────────────────────────────
-- 0029 — EVENT / OUTBOX sloj, temelj (v2-2 kriška 1). ADR 0012 (PRIHVAĆENO).
--
-- outbox_events = durable red domenskih događaja. Event se upisuje U ISTOJ
-- transakciji sa poslovnom promenom (kroz trigere, 0030) → nikad se ne gubi i
-- nikad ne nastaje za promenu koja je rollback-ovana. Potrošači ga čitaju
-- ASINHRONO (Realtime tabla + budući worker/cron).
--
-- ANTI-SCOPE (ADR 0012 §7): tabele OSTAJU izvor istine; ovo je samo tok
-- obaveštavanja (ne event sourcing, ne replay, ne spoljni broker).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.outbox_events (
  id              uuid primary key default gen_random_uuid(),
  occurred_at     timestamptz not null default now(),
  event_type      text not null,                    -- 'domen.akcija', npr. 'trip.created'
  event_version   int  not null default 1,          -- evolucija payload-a
  aggregate_type  text not null,                    -- 'trip' | 'attachment' | …
  aggregate_id    uuid not null,
  company_id      uuid not null references companies(id) on delete cascade,
  actor_user_id   uuid,                             -- ko je izazvao (auth.uid()); null = sistem/cron
  payload         jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,             -- stabilan identitet reda → dedup kod potrošača
  processed_at    timestamptz,                      -- null = neobrađen
  attempts        int not null default 0,
  error           text
);

-- Indeksi: (a) brzo uzimanje NEOBRAĐENIH (worker), (b) realtime/tabla po firmi.
create index if not exists outbox_unprocessed_idx
  on public.outbox_events (occurred_at) where processed_at is null;
create index if not exists outbox_company_idx
  on public.outbox_events (company_id, occurred_at desc);

alter table public.outbox_events enable row level security;

-- RLS: kancelarija (owner/dispatcher) ČITA samo evente SVOJE firme (živa tabla).
-- Upis ide ISKLJUČIVO kroz SECURITY DEFINER helper (ispod) — klijent nema insert/
-- update/delete politiku (nema forging-a; worker menja processed_at kroz service_role).
drop policy if exists outbox_select_office on public.outbox_events;
create policy outbox_select_office on public.outbox_events for select using (
  public.is_office_role() and company_id = public.current_company_id()
);

-- ─────────────────────────────────────────────────────────────
-- Emit helper: JEDINI put upisa u outbox. SECURITY DEFINER → zaobilazi RLS insert.
-- Zovu ga SAMO trigeri/RPC-ovi (revoke od public → klijent ne može da falsifikuje event).
-- idempotency_key: ako se ne prosledi → svež uuid (svaki red jedinstven; potrošač deduplira po njemu).
-- ─────────────────────────────────────────────────────────────
create or replace function public.emit_outbox_event(
  p_event_type      text,
  p_aggregate_type  text,
  p_aggregate_id    uuid,
  p_company_id      uuid,
  p_payload         jsonb default '{}'::jsonb,
  p_event_version   int   default 1,
  p_idempotency_key text  default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.outbox_events (
    event_type, event_version, aggregate_type, aggregate_id,
    company_id, actor_user_id, payload, idempotency_key
  ) values (
    p_event_type, p_event_version, p_aggregate_type, p_aggregate_id,
    p_company_id, auth.uid(), coalesce(p_payload, '{}'::jsonb),
    coalesce(p_idempotency_key, gen_random_uuid()::text)
  ) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.emit_outbox_event(text,text,uuid,uuid,jsonb,int,text) from public;

-- ─────────────────────────────────────────────────────────────
-- Retencija: čišćenje OBRAĐENIH evenata starijih od N dana (audit_log ostaje trajno,
-- to je sestrinska tabela — v. ADR 0012 §6, gradi se u kasnijoj kriški). Zove worker/cron
-- kroz service_role; authenticated NE sme da briše evente.
-- ─────────────────────────────────────────────────────────────
create or replace function public.outbox_prune(p_days int default 30)
  returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.outbox_events
   where processed_at is not null
     and processed_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.outbox_prune(int) from public;
grant execute on function public.outbox_prune(int) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Realtime: kancelarijska tabla se sama osvežava. Realtime poštuje RLS (authenticated
-- vidi samo svoju firmu). Idempotentno dodavanje u publikaciju (ako postoji).
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outbox_events'
    ) then
      alter publication supabase_realtime add table public.outbox_events;
    end if;
  end if;
end $$;
