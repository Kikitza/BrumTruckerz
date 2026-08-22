-- ─────────────────────────────────────────────────────────────────────────────
-- 0033 — OUTBOX worker RPC-ovi: bezbedan claim + mark (v2-2 kriška 3). ADR 0012 §5b.
--
-- Worker (Edge, service_role) NE može da drži red-lock preko HTTP-a dok radi handler
-- (handleri su spolja: push/notifikacije). Zato je claim = ATOMIČAN „lease":
--   FOR UPDATE SKIP LOCKED (paralelni workeri preskaču zaključane) + attempts+1 u
--   ISTOJ transakciji → drugi worker istu grupu neće ponovo uzeti. Obrada i markiranje
--   (processed/error) idu POSLE, van locka. Isporuka je at-least-once → handleri moraju
--   biti idempotentni (ADR 0012 §3).
--
-- DEAD-LETTER (obrazac iz offline reda, A4): claim uzima samo attempts < MAX; kad
-- attempts dostigne MAX (5), red ostaje NEOBRAĐEN ali se VIŠE NE uzima → preskočen,
-- ne blokira ostale (svaki red nezavisan zbog SKIP LOCKED).
-- ─────────────────────────────────────────────────────────────────────────────

-- Uzmi batch neobrađenih (i još „živih" — attempts < MAX) i odmah ih „lease"-uj (attempts+1).
create or replace function public.outbox_claim_batch(p_limit int default 50, p_max_attempts int default 5)
  returns setof public.outbox_events
  language plpgsql security definer set search_path = public as $$
begin
  return query
  with c as (
    select id from public.outbox_events
     where processed_at is null and attempts < p_max_attempts
     order by occurred_at
     for update skip locked
     limit greatest(coalesce(p_limit, 50), 0)
  )
  update public.outbox_events o
     set attempts = o.attempts + 1
    from c
   where o.id = c.id
  returning o.*;
end $$;
revoke execute on function public.outbox_claim_batch(int, int) from public;
grant execute on function public.outbox_claim_batch(int, int) to service_role;

-- Uspeh handlera → red obrađen (processed_at), greška očišćena.
create or replace function public.outbox_mark_processed(p_id uuid)
  returns void
  language sql security definer set search_path = public as $$
  update public.outbox_events set processed_at = now(), error = null where id = p_id;
$$;
revoke execute on function public.outbox_mark_processed(uuid) from public;
grant execute on function public.outbox_mark_processed(uuid) to service_role;

-- Greška handlera → zapiši poruku (attempts je već uvećan pri claim-u; retry ide sledeći put).
create or replace function public.outbox_mark_error(p_id uuid, p_error text)
  returns void
  language sql security definer set search_path = public as $$
  update public.outbox_events set error = left(p_error, 1000) where id = p_id;
$$;
revoke execute on function public.outbox_mark_error(uuid, text) from public;
grant execute on function public.outbox_mark_error(uuid, text) to service_role;
