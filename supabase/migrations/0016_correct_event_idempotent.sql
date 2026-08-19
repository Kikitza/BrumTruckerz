-- ─────────────────────────────────────────────────────────────────────────────
-- 0016 — correct_trip_event: idempotentnost na retry (audit B3).
--
-- Offline red može da ponovi RPC posle uspešnog upisa (mreža padne pre brisanja
-- stavke iz reda) → bez idempotencije nastaje DUPLA verzija ispravke i kvari se
-- lanac (is_current/version). Rešenje: klijent šalje uuid NOVE verzije (p_new_id);
-- ako taj red već postoji, RPC vraća njega (nema duplog upisa).
--
-- Potpis se menja (nov parametar) → drop + create. Zadržava A2 (bez platform_admin)
-- i A3 (blokada pri obustavi) iz 0015.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists correct_trip_event(uuid, event_type, timestamptz, text, text, text);

create or replace function correct_trip_event(
  p_event_id    uuid,
  p_new_id      uuid        default null,   -- klijentski uuid nove verzije (idempotencija)
  p_type        event_type  default null,
  p_occurred_at timestamptz default null,
  p_location    text        default null,
  p_note        text        default null,
  p_comment     text        default null    -- razlog ispravke (preporučeno)
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  old_row trip_events%rowtype;
  new_id  uuid;
  allowed boolean;
begin
  -- Idempotencija: ako je nova verzija sa ovim id-em već upisana, vrati je (retry = uspeh).
  if p_new_id is not null and exists (select 1 from trip_events where id = p_new_id) then
    return p_new_id;
  end if;

  select * into old_row from trip_events where id = p_event_id and is_current;
  if not found then raise exception 'Događaj ne postoji ili je već zamenjen novom verzijom'; end if;

  -- A2: BEZ platform_admin — admin ne ispravlja dnevnik firmi.
  allowed :=
    (old_row.company_id = current_company_id() and current_role_name() = 'owner')
    or (current_role_name() = 'driver'
        and exists (select 1 from trips t
                     where t.id = old_row.trip_id and t.driver_id = current_driver_id()));
  if not allowed then raise exception 'Nije dozvoljeno'; end if;

  -- A3: obustavljena firma ne menja podatke.
  if not company_is_active(old_row.company_id) then
    raise exception 'COMPANY_SUSPENDED: firma je obustavljena' using errcode = '42501';
  end if;

  insert into trip_events
    (id, company_id, trip_id, type, occurred_at, location, note,
     version, is_current, supersedes_event_id, edit_comment, created_by)
  values
    (coalesce(p_new_id, gen_random_uuid()),
     old_row.company_id, old_row.trip_id,
     coalesce(p_type, old_row.type),
     coalesce(p_occurred_at, old_row.occurred_at),
     coalesce(p_location, old_row.location),
     coalesce(p_note, old_row.note),
     old_row.version + 1, true, old_row.id, p_comment, auth.uid())
  returning id into new_id;

  update trip_events set is_current = false where id = old_row.id;
  return new_id;
end $$;

grant execute on function correct_trip_event(uuid, uuid, event_type, timestamptz, text, text, text) to authenticated;
