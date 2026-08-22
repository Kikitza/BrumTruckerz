-- ─────────────────────────────────────────────────────────────────────────────
-- 0035 — MREŽNI PROFIL RADNIKA (v2-3 kriška 2). ADR 0014 (PRIHVAĆENO).
--
-- Radnik gradi profil za vidljivost tržištu; firme PRETRAŽUJU (kroz RPC, javne kartice
-- BEZ PII) i POZIVAJU (marketplace = nov IZVOR postojeće accept_invitation kapije).
--
-- DATA-COLLISION GUARD (ADR 0014 §5 / PDF §6): countries_of_interest je ODVOJENA kolona,
-- validirana prema countries (ISO), NIKAD se ne meša sa zemljama rute (0028)/prebivališta/firme.
-- PRIVATNOST: visibility='private' po DEFAULTU (opt-in vidljivost).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.network_profiles (
  user_id               uuid primary key references app_users(id) on delete cascade,
  visibility            text not null default 'private' check (visibility in ('private','visible')),
  seeking_role          text check (seeking_role in ('driver','dispatcher')),
  countries_of_interest text[] not null default '{}',   -- ISO, ODVOJENO od rute/prebivališta
  languages             text[] not null default '{}',
  available_from        date,
  certificates          jsonb not null default '{}'::jsonb,  -- SAMODEKLARISANO (UI to označava)
  note                  text,
  updated_at            timestamptz not null default now()
);
create index if not exists network_profiles_visible_idx
  on public.network_profiles (visibility, seeking_role) where visibility = 'visible';

-- Validacija zemalja interesa (ISO ⊆ countries) + auto updated_at. Guard nad direktnim RLS upisom.
create or replace function public.tg_network_profiles_validate() returns trigger
  language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from unnest(NEW.countries_of_interest) code
     where code not in (select c.code from countries c)
  ) then
    raise exception 'INVALID_COUNTRY' using errcode = '23514';
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;
drop trigger if exists network_profiles_validate on public.network_profiles;
create trigger network_profiles_validate before insert or update on public.network_profiles
  for each row execute function public.tg_network_profiles_validate();

-- RLS: radnik čita/menja SAMO svoj profil. Office NEMA direktan select — pretraga kroz RPC.
alter table public.network_profiles enable row level security;
drop policy if exists np_self on public.network_profiles;
create policy np_self on public.network_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Marketplace pozivi ciljaju konkretnog korisnika (postojeća kapija, nov izvor).
alter table public.invitations add column if not exists target_user_id uuid references app_users(id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- network_search: office pretražuje VIDLJIVE profile → JAVNE KARTICE BEZ PII.
-- Vraća javni broj (BT-D/BT-T — trajni javni identifikator po dizajnu), NIKAD ime/kontakt/mejl.
-- ─────────────────────────────────────────────────────────────
create or replace function public.network_search(
  p_role text default null, p_country text default null, p_language text default null,
  p_available_only boolean default false, p_limit int default 50, p_offset int default 0
) returns table (
  user_id uuid, public_no text, seeking_role text,
  countries_of_interest text[], languages text[], available_from date, certificates jsonb, note text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_office_role() then raise exception 'NOT_OFFICE' using errcode = '42501'; end if;
  return query
    select np.user_id, coalesce(dp.public_no, disp.public_no), np.seeking_role,
           np.countries_of_interest, np.languages, np.available_from, np.certificates, np.note
      from network_profiles np
      left join driver_profiles     dp   on dp.user_id   = np.user_id
      left join dispatcher_profiles  disp on disp.user_id = np.user_id
     where np.visibility = 'visible'
       and (p_role     is null or np.seeking_role = p_role)
       and (p_country  is null or p_country  = any(np.countries_of_interest))
       and (p_language is null or p_language = any(np.languages))
       and (not p_available_only or np.available_from is null or np.available_from <= current_date)
     order by np.updated_at desc
     limit greatest(coalesce(p_limit, 50), 0) offset greatest(coalesce(p_offset, 0), 0);
end $$;
grant execute on function public.network_search(text,text,text,boolean,int,int) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- network_invite: office poziva radnika → kreira CILJANU pozivnicu (ista kapija) + event.
-- Idempotentno: ako pending poziv toj osobi iz ove firme već postoji → vrati postojeći.
-- ─────────────────────────────────────────────────────────────
create or replace function public.network_invite(p_target uuid, p_role text)
  returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_company uuid := public.current_company_id(); v_id uuid; v_code text;
begin
  if not public.is_office_role() then raise exception 'NOT_OFFICE' using errcode = '42501'; end if;
  if p_role not in ('driver','dispatcher') then raise exception 'BAD_ROLE' using errcode = '22023'; end if;
  if not public.company_is_active(v_company) then raise exception 'COMPANY_SUSPENDED' using errcode = '42501'; end if;

  select id, code into v_id, v_code from invitations
   where company_id = v_company and target_user_id = p_target and status = 'pending' and expires_at > now()
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('invite_id', v_id, 'code', v_code, 'status', 'already_pending');
  end if;

  insert into invitations (company_id, role, created_by, target_user_id)
    values (v_company, p_role, auth.uid(), p_target)
    returning id, code into v_id, v_code;

  perform public.emit_outbox_event('marketplace.invite.sent', 'invitation', v_id, v_company,
    jsonb_build_object('target_user_id', p_target, 'role', p_role));

  return jsonb_build_object('invite_id', v_id, 'code', v_code, 'status', 'sent');
end $$;
grant execute on function public.network_invite(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- my_network_invites: radnik vidi pozive UPUĆENE NJEMU (firma + rola + kod za prihvatanje).
-- decline_network_invite: radnik odbija svoj poziv (status → cancelled).
-- ─────────────────────────────────────────────────────────────
create or replace function public.my_network_invites()
  returns table (invite_id uuid, code text, company_id uuid, company_name text, role text, created_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select i.id, i.code, i.company_id, c.name, i.role, i.created_at
    from invitations i join companies c on c.id = i.company_id
   where i.target_user_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
   order by i.created_at desc;
$$;
grant execute on function public.my_network_invites() to authenticated;

create or replace function public.decline_network_invite(p_invite uuid)
  returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update invitations set status = 'cancelled'
   where id = p_invite and target_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'INVITE_NOT_FOUND' using errcode = '42704'; end if;
end $$;
grant execute on function public.decline_network_invite(uuid) to authenticated;
