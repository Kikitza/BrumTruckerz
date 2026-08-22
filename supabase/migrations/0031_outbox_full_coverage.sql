-- ─────────────────────────────────────────────────────────────────────────────
-- 0031 — OUTBOX: puna pokrivenost domenskih evenata (v2-2 kriška 2). ADR 0012.
--
-- Dopunjava emisije preko trigera (isti obrazac kao 0030 — pokriva RLS i RPC put):
--   trips:       + trip.status_changed, trip.completed
--   invoices:    invoice.issued (INSERT — pokriva issue_invoice RPC put), invoice.paid, invoice.cancelled
--   employments: employment.started (INSERT active), employment.ended (ended_at postavljen)
--   customers:   customer.created (INSERT)
--   reminder.due: RAČUNATI event (ADR §3) — emituje reminders-cron eksplicitno (grant ispod).
-- ─────────────────────────────────────────────────────────────────────────────

-- reminders-cron (service_role) sme da poziva emit_outbox_event za računati reminder.due.
-- (emit je revoke-ovan od public u 0029; ovde eksplicitan grant serverskom putu.)
grant execute on function public.emit_outbox_event(text,text,uuid,uuid,jsonb,int,text) to service_role;

-- ═══ trips: + status_changed / completed (uz postojeći trip.created / driver.assigned) ═══
create or replace function public.tg_trips_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_outbox_event(
      'trip.created', 'trip', NEW.id, NEW.company_id,
      jsonb_build_object('title', NEW.title, 'status', NEW.status,
        'driver_id', NEW.driver_id, 'vehicle_id', NEW.vehicle_id, 'trailer_id', NEW.trailer_id));
  elsif TG_OP = 'UPDATE' then
    if NEW.driver_id  is distinct from OLD.driver_id
    or NEW.vehicle_id is distinct from OLD.vehicle_id
    or NEW.trailer_id is distinct from OLD.trailer_id then
      perform public.emit_outbox_event('driver.assigned', 'trip', NEW.id, NEW.company_id,
        jsonb_build_object(
          'driver_id', NEW.driver_id, 'prev_driver_id', OLD.driver_id,
          'vehicle_id', NEW.vehicle_id, 'prev_vehicle_id', OLD.vehicle_id,
          'trailer_id', NEW.trailer_id, 'prev_trailer_id', OLD.trailer_id));
    end if;
    if NEW.status is distinct from OLD.status then
      perform public.emit_outbox_event('trip.status_changed', 'trip', NEW.id, NEW.company_id,
        jsonb_build_object('prev_status', OLD.status, 'status', NEW.status));
      if NEW.status = 'finished' then
        perform public.emit_outbox_event('trip.completed', 'trip', NEW.id, NEW.company_id,
          jsonb_build_object('finished_at', NEW.finished_at));
      end if;
    end if;
  end if;
  return null;
end $$;

-- ═══ invoices: issued (INSERT) / paid / cancelled (UPDATE prelaz statusa) ═══
create or replace function public.tg_invoices_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    perform public.emit_outbox_event('invoice.issued', 'invoice', NEW.id, NEW.company_id,
      jsonb_build_object('invoice_no', NEW.invoice_no, 'total', NEW.total, 'currency', NEW.currency,
        'customer_id', NEW.customer_id, 'trip_id', NEW.trip_id));
  elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    if NEW.status = 'paid' then
      perform public.emit_outbox_event('invoice.paid', 'invoice', NEW.id, NEW.company_id,
        jsonb_build_object('total', NEW.total, 'paid_at', NEW.paid_at));
    elsif NEW.status = 'cancelled' then
      perform public.emit_outbox_event('invoice.cancelled', 'invoice', NEW.id, NEW.company_id,
        jsonb_build_object('cancel_reason', NEW.cancel_reason));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists invoices_outbox on public.invoices;
create trigger invoices_outbox after insert or update on public.invoices
  for each row execute function public.tg_invoices_outbox();

-- ═══ employments: started (INSERT active) / ended (ended_at postavljen) ═══
create or replace function public.tg_employments_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.status = 'active' then
      perform public.emit_outbox_event('employment.started', 'employment', NEW.id, NEW.company_id,
        jsonb_build_object('user_id', NEW.user_id, 'role_on_company', NEW.role_on_company, 'started_at', NEW.started_at));
    end if;
  elsif TG_OP = 'UPDATE' then
    if (OLD.ended_at is null and NEW.ended_at is not null)
    or (OLD.status <> 'ended' and NEW.status = 'ended') then
      perform public.emit_outbox_event('employment.ended', 'employment', NEW.id, NEW.company_id,
        jsonb_build_object('user_id', NEW.user_id, 'ended_at', NEW.ended_at));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists employments_outbox on public.employments;
create trigger employments_outbox after insert or update on public.employments
  for each row execute function public.tg_employments_outbox();

-- ═══ customers: created (INSERT) ═══
create or replace function public.tg_customers_outbox() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.emit_outbox_event('customer.created', 'customer', NEW.id, NEW.company_id,
    jsonb_build_object('name', NEW.name, 'country_code', NEW.country_code));
  return null;
end $$;
drop trigger if exists customers_outbox on public.customers;
create trigger customers_outbox after insert on public.customers
  for each row execute function public.tg_customers_outbox();
