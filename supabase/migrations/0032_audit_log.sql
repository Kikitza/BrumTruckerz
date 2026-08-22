-- ─────────────────────────────────────────────────────────────────────────────
-- 0032 — audit_log: TRAJNA, NEPROMENJIVA knjiga „ko je šta uradio" (v2-2 kriška 2).
--
-- Sestrinska tabela outbox-a (ADR 0012 §6, PDF §11): outbox je PROLAZNI red za
-- isporuku (retencija 30 dana), audit_log je TRAJAN zapis (bez retencije, bez
-- update/delete). Pune je ISTI put — emit_outbox_event upisuje u OBE tabele
-- (jedan izvor istine „desilo se"), pa i trigeri (0030/0031) i cron automatski
-- pišu i audit, bez dodatnog koda.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  occurred_at    timestamptz not null default now(),
  company_id     uuid not null references companies(id) on delete cascade,
  actor_user_id  uuid,                       -- ko je izazvao; null = sistem/cron
  action         text not null,              -- = event_type (npr. 'invoice.paid')
  aggregate_type text not null,
  aggregate_id   uuid not null,
  summary        jsonb not null default '{}'::jsonb  -- kratko šta se promenilo (= payload eventa)
);
create index if not exists audit_log_company_idx on public.audit_log (company_id, occurred_at desc);

alter table public.audit_log enable row level security;

-- RLS: SAMO office čita SVOJU firmu (poslovni sadržaj). platform_admin NAMERNO
-- ne čita (nije poslovni učesnik firme; audit A2 duh). Vozač nema office ulogu → 0.
-- NEMA insert/update/delete politike za authenticated → upis ISKLJUČIVO kroz
-- SECURITY DEFINER emit; knjiga je NEPROMENJIVA (nema update/delete puta).
drop policy if exists audit_select_office on public.audit_log;
create policy audit_select_office on public.audit_log for select using (
  public.is_office_role() and company_id = public.current_company_id()
);

-- ─────────────────────────────────────────────────────────────
-- emit_outbox_event: sada upisuje u OUTBOX (prolazno) I audit_log (trajno).
-- Ista signatura → grantovi/revoke iz 0029/0031 ostaju; svi pozivaoci (trigeri,
-- cron) automatski pune obe tabele. summary = payload eventa (kratko šta se desilo).
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

  -- Trajna knjiga: isti „desilo se", ne čisti se.
  insert into public.audit_log (
    company_id, actor_user_id, action, aggregate_type, aggregate_id, summary
  ) values (
    p_company_id, auth.uid(), p_event_type, p_aggregate_type, p_aggregate_id,
    coalesce(p_payload, '{}'::jsonb)
  );

  return v_id;
end $$;
