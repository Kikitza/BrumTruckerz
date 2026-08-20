// API sloj za naručioce (klijente) — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// RLS (0021): KANCELARIJA (owner+dispatcher) pun pristup u svojoj firmi; vozač/admin NIŠTA.
import { supabase } from "../../lib/supabase";
import { currentCompanyId } from "../auth/currentUser";

export type Customer = {
  id: string;
  company_id: string;
  name: string;
  vat_number: string | null;
  country_code: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  payment_terms_days: number;
  note: string | null;
  archived_at: string | null;
  created_at: string;
  vies_valid: boolean | null;       // ishod poslednje VIES provere (0022)
  vies_checked_at: string | null;
  vies_name: string | null;         // naziv iz VIES registra (kad je validan)
  trip_count: number; // broj tura koje ga koriste (odlučuje arhiviraj vs briši)
};

export type CustomerInput = {
  name: string;
  vat_number?: string | null;
  country_code?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  payment_terms_days?: number | null;
  note?: string | null;
};

const COLS =
  "id, company_id, name, vat_number, country_code, contact_email, contact_phone, address, payment_terms_days, note, archived_at, created_at, vies_valid, vies_checked_at, vies_name, trips(count)";

type Row = Omit<Customer, "trip_count"> & { trips: { count: number }[] };

function toCustomer(r: Row): Customer {
  const { trips, ...rest } = r;
  return { ...rest, trip_count: trips?.[0]?.count ?? 0 };
}

// Sve naručioce firme (aktivne + arhivirane); UI filtrira po archived_at.
export async function listCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers").select(COLS).order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toCustomer(r as unknown as Row));
}

// Samo AKTIVNI (za picker na turi).
export async function listActiveCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers").select(COLS).is("archived_at", null).order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toCustomer(r as unknown as Row));
}

function clean(input: CustomerInput) {
  const s = (v?: string | null) => (v?.trim() ? v.trim() : null);
  return {
    name: input.name.trim(),
    vat_number: s(input.vat_number),
    country_code: input.country_code?.trim() ? input.country_code.trim().toUpperCase().slice(0, 2) : null,
    contact_email: s(input.contact_email),
    contact_phone: s(input.contact_phone),
    address: s(input.address),
    payment_terms_days: input.payment_terms_days ?? 30,
    note: s(input.note),
  };
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const company_id = await currentCompanyId();
  const { data, error } = await supabase
    .from("customers").insert({ company_id, ...clean(input) }).select(COLS).single();
  if (error) throw error;
  return toCustomer(data as unknown as Row);
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const { data, error } = await supabase
    .from("customers").update(clean(input)).eq("id", id).select(COLS).single();
  if (error) throw error;
  return toCustomer(data as unknown as Row);
}

export async function archiveCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function unarchiveCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").update({ archived_at: null }).eq("id", id);
  if (error) throw error;
}

// Brisanje — dozvoljeno SAMO bez tura (baza: ON DELETE RESTRICT). UI nudi brisanje samo za trip_count=0.
export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// ── VIES provera PIB-a (Edge funkcija vies-check) ──
export type ViesResult = {
  status: "valid" | "invalid" | "unavailable";
  name: string | null;
  address: string | null;
  checked_at: string | null;
};

// Izvuci poruku greške iz Edge funkcije (telo { error }) — inače generička.
async function fnError(error: unknown, fallback: string): Promise<Error> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  try {
    const body = await ctx?.json?.();
    if (body?.error) return new Error(body.error);
  } catch { /* telo nije JSON */ }
  return new Error((error as Error)?.message ?? fallback);
}

// Proveri PIB kroz VIES. Ako je customer_id dat → ishod se upisuje na naručioca (badge).
export async function checkVat(input: {
  country_code: string; vat_number: string; customer_id?: string | null;
}): Promise<ViesResult> {
  const { data, error } = await supabase.functions.invoke("vies-check", {
    body: {
      country_code: input.country_code,
      vat_number: input.vat_number,
      ...(input.customer_id ? { customer_id: input.customer_id } : {}),
    },
  });
  if (error) throw await fnError(error, "VIES provera nije uspela");
  return data as ViesResult;
}
