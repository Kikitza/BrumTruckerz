-- ─────────────────────────────────────────────────────────────────────────────
-- 0023 — FAKTURE v1: podaci izdavaoca, brojači po firmi, fakture. F2 kruna.
--
--   (A) invoice_settings — podaci IZDAVAOCA (po firmi); default PDV stopa/napomena; prefix broja.
--   (B) invoice_counters + next_invoice_no(company) — brojevi po (firma, godina), SELECT … FOR UPDATE
--       (C2 TOCTOU: bez preskakanja i duplikata pod konkurencijom), format <prefix><GODINA>-<NNN>.
--   (C) invoices — tura → faktura; broj unique po firmi; iznosi RAČUNATI U KODU (round2, pravilo #5);
--       status issued|paid|cancelled (BEZ draft; BEZ delete — storno = cancelled + cancel_reason).
--       „Kasni" NIJE kolona — computed (issued && due_date < danas).
--   (D) issue_invoice(...) — SECURITY DEFINER RPC: zaključa brojač, izračuna iznose, ubaci fakturu —
--       sve u JEDNOJ transakciji → broj se „potroši" samo ako faktura zaista nastane (bez rupa).
--
-- RLS: office (owner+dispatcher) svojoj firmi; vozač/platform_admin NIŠTA; suspend-gate; bez DELETE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (A) invoice_settings ──
create table invoice_settings (
  company_id       uuid primary key references companies(id) on delete cascade,
  legal_name       text,
  address          text,
  tax_id           text,             -- PIB izdavaoca
  reg_no           text,             -- matični broj
  bank_account     text,             -- tekući račun / IBAN
  default_vat_rate numeric(6,3) not null default 0,
  default_vat_note text,             -- npr. „PDV nije obračunat po čl. …" (daje knjigovođa)
  prefix           text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);
alter table invoice_settings enable row level security;
create policy invoice_settings_office on invoice_settings for all
  using  (company_id = current_company_id() and is_office_role())
  with check (company_id = current_company_id() and is_office_role());
create policy invoice_settings_active_insert on invoice_settings as restrictive for insert
  with check (current_role_name() = 'platform_admin' or company_is_active(company_id));
create policy invoice_settings_active_update on invoice_settings as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

-- ── (B) invoice_counters (samo definer piše; klijent nema politiku → fail-closed) ──
create table invoice_counters (
  company_id uuid not null references companies(id) on delete cascade,
  year       int  not null,
  last_no    int  not null default 0,
  primary key (company_id, year)
);
alter table invoice_counters enable row level security;

create or replace function public.next_invoice_no(p_company uuid) returns text
  language plpgsql volatile security definer set search_path = public as $$
declare yr int := extract(year from current_date)::int; n int; pfx text;
begin
  insert into invoice_counters (company_id, year, last_no) values (p_company, yr, 0)
    on conflict (company_id, year) do nothing;
  -- C2: zaključaj red brojača pa uvećaj (bez TOCTOU trke → bez rupa/duplikata).
  select last_no into n from invoice_counters where company_id = p_company and year = yr for update;
  n := n + 1;
  update invoice_counters set last_no = n where company_id = p_company and year = yr;
  pfx := coalesce((select prefix from invoice_settings where company_id = p_company), '');
  return pfx || yr::text || '-' || lpad(n::text, 3, '0');
end $$;

-- ── (C) invoices ──
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete restrict,  -- naručilac obavezan
  trip_id         uuid references trips(id) on delete restrict,               -- opciono; ne briši turu sa fakturom
  invoice_no      text not null,
  issue_date      date not null default current_date,
  due_date        date,
  currency        text not null default 'EUR',
  amount          numeric(14,2) not null,        -- osnovica (neto)
  vat_rate        numeric(6,3)  not null default 0,
  vat_amount      numeric(14,2) not null default 0,
  total           numeric(14,2) not null,
  vat_note        text,
  status          text not null default 'issued' check (status in ('issued','paid','cancelled')),
  cancel_reason   text,
  paid_at         date,
  pdf_storage_key text,
  note            text,
  created_by      uuid references app_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (company_id, invoice_no)
);
create index on invoices (company_id, status, issue_date desc);
create index on invoices (company_id, customer_id);
create index on invoices (company_id, trip_id);

alter table invoices enable row level security;
-- Čitanje + izmena (plaćeno/storno/pdf ključ): office svojoj firmi. UPIS ide kroz issue_invoice
-- (definer) — NEMA insert politike da se numeracija ne zaobiđe. NEMA delete politike (storno = status).
create policy invoices_office_select on invoices for select
  using (company_id = current_company_id() and is_office_role());
create policy invoices_office_update on invoices for update
  using  (company_id = current_company_id() and is_office_role())
  with check (company_id = current_company_id() and is_office_role());
create policy invoices_active_update on invoices as restrictive for update
  using (current_role_name() = 'platform_admin' or company_is_active(company_id));

-- ── (D) issue_invoice: atomično (brojač + faktura u jednoj transakciji) ──
create or replace function public.issue_invoice(
  p_customer_id uuid,
  p_trip_id     uuid,
  p_currency    text,
  p_amount      numeric,
  p_vat_rate    numeric,
  p_due_date    date,
  p_vat_note    text,
  p_note        text
) returns invoices
  language plpgsql volatile security definer set search_path = public as $$
declare
  v_company uuid := current_company_id();
  v_vat_amount numeric(14,2);
  v_total numeric(14,2);
  v_no text;
  result invoices;
begin
  if not is_office_role() then raise exception 'INVOICE_NOT_OFFICE' using errcode = '42501'; end if;
  if not company_is_active(v_company) then raise exception 'COMPANY_SUSPENDED' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'INVOICE_BAD_AMOUNT'; end if;

  -- naručilac mora biti iz iste firme
  if not exists (select 1 from customers c where c.id = p_customer_id and c.company_id = v_company) then
    raise exception 'INVOICE_CUSTOMER_NOT_IN_COMPANY';
  end if;
  -- tura (ako je data) mora biti iz iste firme
  if p_trip_id is not null and not exists (select 1 from trips t where t.id = p_trip_id and t.company_id = v_company) then
    raise exception 'INVOICE_TRIP_NOT_IN_COMPANY';
  end if;

  -- iznosi RAČUNATI U KODU (round2)
  v_vat_amount := round(p_amount * coalesce(p_vat_rate, 0) / 100.0, 2);
  v_total := round(p_amount + v_vat_amount, 2);
  v_no := next_invoice_no(v_company);

  insert into invoices (
    company_id, customer_id, trip_id, invoice_no, issue_date, due_date, currency,
    amount, vat_rate, vat_amount, total, vat_note, status, note, created_by
  ) values (
    v_company, p_customer_id, p_trip_id, v_no, current_date, p_due_date, coalesce(nullif(trim(p_currency),''),'EUR'),
    round(p_amount, 2), coalesce(p_vat_rate, 0), v_vat_amount, v_total, p_vat_note, 'issued', p_note, auth.uid()
  ) returning * into result;

  return result;
end $$;
grant execute on function public.issue_invoice(uuid, uuid, text, numeric, numeric, date, text, text) to authenticated;
grant execute on function public.next_invoice_no(uuid) to authenticated;
