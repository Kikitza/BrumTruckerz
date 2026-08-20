-- ─────────────────────────────────────────────────────────────────────────────
-- 0019 — accept_invitation: ime za display_name kod prijave TELEFONOM.
--
-- Prijava telefonom ne nosi ime (nema full_name na app_users, nema email). Dopuna:
--   display_name / drivers.full_name = invited_name iz pozivnice; ako je prazno → 'Vozač'.
-- (Izmena imena je kasnija profil-dorada.) Uklonjen raniji email/'BT' fallback — telefonski
-- nalog nema email, a full_name ne treba da bude imejl. Ostatak funkcije = 0018 (nepromenjen).
-- Aditivno: samo `create or replace` — bez dodira podataka/šeme.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.accept_invitation(p_code text)
  returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  inv    invitations%rowtype;
  usr    app_users%rowtype;
  v_name text;
  v_has_user boolean;
begin
  if v_uid is null then
    raise exception 'INVITE_NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Traži AKTIVNU (pending) pozivnicu za taj kod (najviše jedna — partial-unique).
  select * into inv from invitations where code = v_code and status = 'pending' limit 1;

  if not found then
    -- Nema aktivne — pogledaj poslednju sa tim kodom radi jasne poruke.
    select * into inv from invitations where code = v_code order by created_at desc limit 1;
    if not found then
      raise exception 'INVITE_NOT_FOUND';
    elsif inv.status = 'accepted' and inv.accepted_by = v_uid then
      return jsonb_build_object('status', 'already_accepted', 'role', inv.role, 'company_id', inv.company_id);
    elsif inv.status = 'accepted' then
      raise exception 'INVITE_USED';
    elsif inv.status = 'cancelled' then
      raise exception 'INVITE_CANCELLED';
    else
      raise exception 'INVITE_EXPIRED';
    end if;
  end if;

  -- Istek (lenjo obeleži pa odbij).
  if inv.expires_at <= now() then
    update invitations set status = 'expired' where id = inv.id and status = 'pending';
    raise exception 'INVITE_EXPIRED';
  end if;

  -- Obustavljena firma ne prima nove članove (definer zaobilazi RLS → eksplicitno).
  if not company_is_active(inv.company_id) then
    raise exception 'INVITE_COMPANY_SUSPENDED' using errcode = '42501';
  end if;

  -- Pozivalac (može i da NE postoji kao app_users — svež nalog bez firme).
  select * into usr from app_users where id = v_uid;
  v_has_user := found;

  -- Uloge koje NE prihvataju pozivnice (vlasnik upravlja pozivnicama; admin je van firme).
  if v_has_user and usr.role in ('owner', 'platform_admin') then
    raise exception 'INVITE_ROLE_CANNOT_ACCEPT';
  end if;

  -- Već član DRUGE firme → prelazak firme je kasnija kriška (selidba), ne ovde.
  if v_has_user and usr.company_id is not null and usr.company_id <> inv.company_id then
    raise exception 'INVITE_OTHER_COMPANY';
  end if;

  -- Ime za profil/drivers: iz pozivnice (invited_name), pa full_name naloga; prazno → 'Vozač'
  -- (prijava telefonom nema ni jedno ni drugo). Izmena imena = kasnija profil-dorada.
  v_name := coalesce(nullif(trim(inv.invited_name), ''), nullif(trim(usr.full_name), ''), 'Vozač');

  if inv.role = 'driver' then
    -- ── MOST: app_users (izvor pristupa) ──
    if not v_has_user then
      insert into app_users (id, company_id, role, full_name)
        values (v_uid, inv.company_id, 'driver', v_name);
    elsif usr.company_id is null then
      update app_users set company_id = inv.company_id where id = v_uid;
    end if;

    -- ── Trajni identitet: driver_profile (dobija BT-D broj kroz default) ──
    insert into driver_profiles (user_id, display_name)
      values (v_uid, v_name)
      on conflict (user_id) do nothing;

    -- ── drivers red u toj firmi — BEZ duplikata (lekcija blizanaca; drivers_user_id_uidx) ──
    if not exists (select 1 from drivers d where d.company_id = inv.company_id and d.user_id = v_uid) then
      insert into drivers (company_id, user_id, full_name) values (inv.company_id, v_uid, v_name);
    end if;

  else  -- inv.role = 'dispatcher'
    -- Dispečeru upisujemo SAMO identitet + zaposlenje; pristup/uloga stižu u K4.
    -- Zahteva postojeći app_users red (FK profila/zaposlenja) — svež nalog bez identiteta
    -- ne može još da postane dispečer (enum user_role nema 'dispatcher' do K4).
    if not v_has_user then
      raise exception 'INVITE_DISPATCHER_NOT_READY';
    end if;
    insert into dispatcher_profiles (user_id, display_name)
      values (v_uid, v_name)
      on conflict (user_id) do nothing;
  end if;

  -- ── AKTIVNO zaposlenje (osoba↔firma) — „tačno jedno aktivno" (employments_one_active_uidx) ──
  if not exists (
    select 1 from employments e
     where e.user_id = v_uid and e.company_id = inv.company_id and e.status = 'active'
  ) then
    insert into employments (company_id, user_id, role_on_company, status)
      values (inv.company_id, v_uid, inv.role, 'active');
  end if;

  -- ── Označi pozivnicu iskorišćenom ──
  update invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = inv.id;

  return jsonb_build_object('status', 'accepted', 'role', inv.role, 'company_id', inv.company_id);
end $$;
grant execute on function public.accept_invitation(text) to authenticated;
