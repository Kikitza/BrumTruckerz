// API sloj za fakture — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// RLS (0023): office (owner+dispatcher) svojoj firmi; vozač/admin NIŠTA. Izdavanje ide kroz
// SECURITY DEFINER RPC issue_invoice (numeracija bez rupa); plaćeno/storno/pdf = office UPDATE.
import { supabase } from "../../lib/supabase";
import { currentCompanyId } from "../auth/currentUser";

export type InvoiceStatus = "issued" | "paid" | "cancelled";

export type InvoiceSettings = {
  company_id: string;
  legal_name: string | null;
  address: string | null;
  tax_id: string | null;
  reg_no: string | null;
  bank_account: string | null;
  default_vat_rate: number;
  default_vat_note: string | null;
  prefix: string;
};

export type InvoiceSettingsInput = Omit<InvoiceSettings, "company_id">;

export type Invoice = {
  id: string;
  company_id: string;
  customer_id: string;
  trip_id: string | null;
  invoice_no: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  amount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  vat_note: string | null;
  status: InvoiceStatus;
  cancel_reason: string | null;
  paid_at: string | null;
  pdf_storage_key: string | null;
  note: string | null;
  created_at: string;
};

export type InvoiceRow = Invoice & {
  customer: { name: string } | null;
  trip: { origin: string | null; destination: string | null } | null;
};

// Bogatiji red za PDF (izdavalac se čita zasebno iz invoice_settings).
export type InvoiceFull = Invoice & {
  customer: { name: string; address: string | null; vat_number: string | null; country_code: string | null } | null;
  trip: { origin: string | null; destination: string | null; started_at: string | null } | null;
};

const S_COLS = "company_id, legal_name, address, tax_id, reg_no, bank_account, default_vat_rate, default_vat_note, prefix";
const I_COLS = "id, company_id, customer_id, trip_id, invoice_no, issue_date, due_date, currency, amount, vat_rate, vat_amount, total, vat_note, status, cancel_reason, paid_at, pdf_storage_key, note, created_at";

// ── Podaci izdavaoca (invoice_settings) ──
export async function getInvoiceSettings(): Promise<InvoiceSettings | null> {
  const { data, error } = await supabase.from("invoice_settings").select(S_COLS).maybeSingle();
  if (error) throw error;
  return (data as InvoiceSettings | null) ?? null;
}

export async function upsertInvoiceSettings(input: InvoiceSettingsInput): Promise<InvoiceSettings> {
  const company_id = await currentCompanyId();
  const s = (v?: string | null) => (v?.trim() ? v.trim() : null);
  const row = {
    company_id,
    legal_name: s(input.legal_name), address: s(input.address), tax_id: s(input.tax_id),
    reg_no: s(input.reg_no), bank_account: s(input.bank_account),
    default_vat_rate: input.default_vat_rate ?? 0, default_vat_note: s(input.default_vat_note),
    prefix: input.prefix?.trim() ?? "", updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("invoice_settings").upsert(row).select(S_COLS).single();
  if (error) throw error;
  return data as InvoiceSettings;
}

// ── Liste ──
export async function listInvoices(limit = 50): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(`${I_COLS}, customer:customers(name), trip:trips(origin, destination)`)
    .order("issue_date", { ascending: false })
    .order("invoice_no", { ascending: false })
    .limit(limit); // server paginacija (F3) — „Učitaj još" raste limit
  if (error) throw error;
  return (data ?? []) as unknown as InvoiceRow[];
}

export async function getInvoice(id: string): Promise<InvoiceFull> {
  const { data, error } = await supabase
    .from("invoices")
    .select(`${I_COLS}, customer:customers(name, address, vat_number, country_code), trip:trips(origin, destination, started_at)`)
    .eq("id", id).single();
  if (error) throw error;
  return data as unknown as InvoiceFull;
}

// Ture koje se mogu fakturisati: imaju naručioca + vozarinu i NEMAJU aktivnu (ne-storniranu) fakturu.
export type IssuableTrip = {
  id: string; origin: string | null; destination: string | null;
  revenue: number | null; customer_id: string; customer: { name: string } | null;
};
export async function listIssuableTrips(): Promise<IssuableTrip[]> {
  const [{ data: trips, error: e1 }, { data: inv, error: e2 }] = await Promise.all([
    supabase.from("trips")
      .select("id, origin, destination, revenue, customer_id, customer:customers(name)")
      .not("customer_id", "is", null).not("revenue", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("invoices").select("trip_id, status").neq("status", "cancelled"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const invoiced = new Set((inv ?? []).map((r) => r.trip_id).filter(Boolean));
  return ((trips ?? []) as unknown as IssuableTrip[]).filter((t) => !invoiced.has(t.id));
}

// Kontekst za izdavanje iz ture: predlog iznosa (vozarina), valuta firme, rok naručioca, izdavalac.
export type IssueContext = {
  trip: { id: string; origin: string | null; destination: string | null; revenue: number | null; customer_id: string | null };
  customer: { name: string; payment_terms_days: number } | null;
  settings: InvoiceSettings | null;
  base_currency: string;
};
export async function getIssueContext(tripId: string): Promise<IssueContext> {
  const { data: trip, error } = await supabase
    .from("trips")
    .select("id, origin, destination, revenue, customer_id, customer:customers(name, payment_terms_days)")
    .eq("id", tripId).single();
  if (error) throw error;
  const settings = await getInvoiceSettings();
  const { data: comp } = await supabase.from("companies").select("base_currency").maybeSingle();
  const c = (trip as unknown as { customer: { name: string; payment_terms_days: number } | null }).customer;
  const tr = trip as unknown as IssueContext["trip"];
  return {
    trip: { id: tr.id, origin: tr.origin, destination: tr.destination, revenue: tr.revenue, customer_id: tr.customer_id },
    customer: c ? { name: c.name, payment_terms_days: c.payment_terms_days } : null,
    settings,
    base_currency: (comp?.base_currency as string) ?? "EUR",
  };
}

// ── Izdavanje (RPC — atomična numeracija) ──
export type IssueInvoiceInput = {
  customer_id: string;
  trip_id?: string | null;
  currency: string;
  amount: number;
  vat_rate: number;
  due_date: string | null;
  vat_note?: string | null;
  note?: string | null;
};
export async function issueInvoice(input: IssueInvoiceInput): Promise<Invoice> {
  const { data, error } = await supabase.rpc("issue_invoice", {
    p_customer_id: input.customer_id,
    p_trip_id: input.trip_id ?? null,
    p_currency: input.currency,
    p_amount: input.amount,
    p_vat_rate: input.vat_rate,
    p_due_date: input.due_date,
    p_vat_note: input.vat_note ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as Invoice;
}

// ── Prelazi statusa + PDF ključ (office UPDATE kroz RLS) ──
export async function markInvoicePaid(id: string, paidAt: string): Promise<void> {
  const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: paidAt }).eq("id", id);
  if (error) throw error;
}
export async function cancelInvoice(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("invoices").update({ status: "cancelled", cancel_reason: reason.trim() || null }).eq("id", id);
  if (error) throw error;
}
export async function setInvoicePdfKey(id: string, key: string): Promise<void> {
  const { error } = await supabase.from("invoices").update({ pdf_storage_key: key }).eq("id", id);
  if (error) throw error;
}
