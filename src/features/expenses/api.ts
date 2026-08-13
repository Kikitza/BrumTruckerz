// Troškovi — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// Multivaluta (pravilo #4): unosi se ORIGINAL sa računa (iznos + valuta);
// kurs i base_amount računa KOD (pravilo #5) kroz zajednički computeBase().
//
// Dve putanje (kao kod tura):
//   * VOZAČ — offline red (addExpense -> enqueue "expense.insert"); handler
//     razrešava kurs pri sinhronizaciji.
//   * VLASNIK — ONLINE (ownerAddExpense/…); kurs se povlači odmah za datum troška.
import { supabase } from "../../lib/supabase";
import { enqueue, listPending } from "../../lib/offline/queue";
import { computeBase } from "../fx/rates";
import { uuidv4 } from "../../lib/uuid";

export type ExpenseCategory = "fuel" | "toll" | "customs" | "forwarding" | "parking" | "other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "fuel", "toll", "customs", "forwarding", "parking", "other",
];

export type Expense = {
  id: string;
  trip_id: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  base_amount: number;
  base_currency: string;
  fx_rate: number | null;
  fx_rate_date: string | null;
  liters: number | null;
  country: string | null;
  occurred_at: string;
  note: string | null;
  created_at: string;
};

const EXPENSE_COLS =
  "id, trip_id, category, original_amount, original_currency, base_amount, base_currency, fx_rate, fx_rate_date, liters, country, occurred_at, note, created_at";

// Stavka koja čeka u offline redu (još bez fx/base — kurs se razrešava pri sinhr.).
// `id` je klijentski uuid (isti koji dobija red u bazi) — prilozi ga referišu i pre sinhr.
export type PendingExpense = {
  queueId: number;
  id: string;
  trip_id: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  occurred_at: string;
  liters: number | null;
  country: string | null;
  note: string | null;
};

// ── VOZAČ (offline red) ──
// Generiše klijentski id (uuid) i vraća ga, da pozivalac može odmah da veže prilog
// za (još nesinhronizovan) trošak. Handler ubacuje red baš sa tim id-em (idempotentno).
export async function addExpense(p: {
  company_id: string; trip_id: string; category: string;
  original_amount: number; original_currency: string;   // ono što piše na računu
  base_currency: string;                                 // bazna valuta firme
  occurred_at?: string; liters?: number; country?: string; note?: string;
  fx_rate?: number;                                      // ručna korekcija kursa (opciono)
}): Promise<string> {
  const id = uuidv4();
  await enqueue("expense.insert", { id, occurred_at: new Date().toISOString(), ...p });
  return id;
}

// Troškovi ove ture koji čekaju u lokalnom redu (prikaz sa bedžom „čeka sinhr.").
// Pending stavke NEMAJU baznu valutu/kurs — prikazuje se samo original (bez lokalnog preračuna).
export async function listPendingExpenses(tripId: string): Promise<PendingExpense[]> {
  const rows = await listPending("expense.insert");
  return rows
    .filter((r) => r.payload?.trip_id === tripId)
    .map((r) => ({
      queueId: r.id,
      id: r.payload.id,
      trip_id: r.payload.trip_id,
      category: r.payload.category,
      original_amount: r.payload.original_amount,
      original_currency: r.payload.original_currency,
      occurred_at: r.payload.occurred_at,
      liters: r.payload.liters ?? null,
      country: r.payload.country ?? null,
      note: r.payload.note ?? null,
    }));
}

// ── VLASNIK (online) ──

// Firma + bazna valuta ulogovanog vlasnika (RLS ionako proverava company_id).
async function currentCompany(): Promise<{ id: string; base_currency: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Nema aktivne sesije");
  const { data, error } = await supabase
    .from("app_users")
    .select("company_id, companies(base_currency)")
    .eq("id", uid)
    .single();
  if (error) throw error;
  const cid = (data?.company_id as string | null) ?? null;
  if (!cid) throw new Error("Korisnik nije vezan za firmu");
  const company = (data as { companies?: { base_currency?: string | null } | null })?.companies;
  return { id: cid, base_currency: company?.base_currency ?? "EUR" };
}

// Bazna valuta firme (vozač je čita ONLINE i kešira — koristi se kao cilj konverzije
// pri offline unosu; RLS company_read dozvoljava i vozaču da čita svoju firmu).
export async function getCompanyBaseCurrency(): Promise<string> {
  return (await currentCompany()).base_currency;
}

// Sinhronizovani troškovi ture iz baze. Deljeno owner+vozač — RLS ograničava vidljivost
// (vlasnik: sve u firmi; vozač: samo svoje ture). Bez dupliranja upita.
export async function listTripExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLS)
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export type OwnerAddExpenseInput = {
  trip_id: string;
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  occurred_at?: string;        // 'YYYY-MM-DD' ili ISO; podrazumevano danas
  liters?: number | null;      // samo za fuel
  country?: string | null;
  note?: string | null;
  fx_rate?: number;            // ručna korekcija kursa (opciono)
};

export async function ownerAddExpense(input: OwnerAddExpenseInput): Promise<Expense> {
  const company = await currentCompany();
  const occurred_at = input.occurred_at ?? new Date().toISOString();
  const date = occurred_at.slice(0, 10);
  const { fx_rate, fx_rate_date, base_amount } = await computeBase(
    input.original_amount,
    input.original_currency,
    company.base_currency,
    date,
    input.fx_rate,
  );

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      company_id: company.id, // RLS with-check; DB default bi ga i sam postavio
      trip_id: input.trip_id,
      category: input.category,
      original_amount: input.original_amount,
      original_currency: input.original_currency,
      fx_rate,
      fx_rate_date,
      base_amount,
      base_currency: company.base_currency,
      liters: input.category === "fuel" ? (input.liters ?? null) : null,
      country: input.country?.trim() || null,
      occurred_at,
      note: input.note?.trim() || null,
      // created_by ide preko DB default-a auth.uid() (migracija 0006) — NE šaljemo ga
    })
    .select(EXPENSE_COLS)
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function ownerDeleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
