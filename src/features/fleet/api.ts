// API sloj za flotu (vozila / prikolice / vozači) — JEDINO mesto koje priča
// sa Supabase-om za ovaj domen (konvencija: features/<domen>/api.ts).
//
// Owner tok je online (za razliku od vozača, čije mutacije idu kroz offline red):
// RLS na vehicles/trailers/drivers dozvoljava PUN pristup vlasniku SVOJE firme.
// Zato svaki insert MORA nositi company_id = current_company_id() (pravilo #1);
// vrednost povlačimo iz app_users za ulogovanog korisnika.
import { supabase } from "../../lib/supabase";

// ── Tipovi (šema: 0001_init.sql) ──
export type Vehicle = {
  id: string;
  company_id: string;
  registration: string;
  make_model: string | null;
  norm_consumption: number | null; // očekivana potrošnja L/100km
  current_odometer: number | null; // ažurira se iz tura
  type_id: string | null;          // tip iz šifarnika (0025); null = prilagođeno
  created_at: string;
};

export type Trailer = {
  id: string;
  company_id: string;
  registration: string;
  type: string | null;
  created_at: string;
};

export type EmploymentType = "indefinite" | "fixed_term";

export type Driver = {
  id: string;
  company_id: string;
  user_id: string | null;
  full_name: string;
  employment_type: EmploymentType | null;
  employment_start: string | null; // 'YYYY-MM-DD' (datum početka rada)
  contract_end: string | null;      // 'YYYY-MM-DD' (ako je na određeno)
  created_at: string;
};

// Ulazi za create/update — bez server-vođenih polja (id/company_id/created_at).
export type VehicleInput = {
  registration: string;
  make_model?: string | null;
  norm_consumption?: number | null;
  current_odometer?: number | null;
  type_id?: string | null;
};
export type TrailerInput = {
  registration: string;
  type?: string | null;
};
export type DriverInput = {
  full_name: string;
  employment_type?: EmploymentType | null;
  employment_start?: string | null;
  contract_end?: string | null;
};

// company_id ulogovanog vlasnika (potreban na svakom insertu; RLS ga i proverava).
async function currentCompanyId(): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Nema aktivne sesije");
  const { data, error } = await supabase
    .from("app_users")
    .select("company_id")
    .eq("id", uid)
    .single();
  if (error) throw error;
  const cid = (data?.company_id as string | null) ?? null;
  if (!cid) throw new Error("Korisnik nije vezan za firmu");
  return cid;
}

// ── Paket firme (plan + limit vozila) ──
export type CompanyPlan = { plan: string; vehicle_limit: number };

// Owner čita SVOJU firmu (RLS company_read). Menja SAMO platforma (nema update policy).
export async function getCompanyPlan(): Promise<CompanyPlan> {
  const company_id = await currentCompanyId();
  const { data, error } = await supabase
    .from("companies").select("plan, vehicle_limit").eq("id", company_id).single();
  if (error) throw error;
  return data as CompanyPlan;
}

export async function countVehicles(): Promise<number> {
  const { count, error } = await supabase.from("vehicles").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

// ── Vozila ──
export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, company_id, registration, make_model, norm_consumption, current_odometer, type_id, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const company_id = await currentCompanyId();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ company_id, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as Vehicle;
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<Vehicle> {
  const { data, error } = await supabase
    .from("vehicles")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Vehicle;
}

export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) throw error;
}

// ── Prikolice ──
export async function listTrailers(): Promise<Trailer[]> {
  const { data, error } = await supabase
    .from("trailers")
    .select("id, company_id, registration, type, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Trailer[];
}

export async function createTrailer(input: TrailerInput): Promise<Trailer> {
  const company_id = await currentCompanyId();
  const { data, error } = await supabase
    .from("trailers")
    .insert({ company_id, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as Trailer;
}

export async function updateTrailer(id: string, input: TrailerInput): Promise<Trailer> {
  const { data, error } = await supabase
    .from("trailers")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Trailer;
}

export async function deleteTrailer(id: string): Promise<void> {
  const { error } = await supabase.from("trailers").delete().eq("id", id);
  if (error) throw error;
}

// ── Vozači ──
export async function listDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, company_id, user_id, full_name, employment_type, employment_start, contract_end, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Driver[];
}

export async function createDriver(input: DriverInput): Promise<Driver> {
  const company_id = await currentCompanyId();
  const { data, error } = await supabase
    .from("drivers")
    .insert({ company_id, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as Driver;
}

export async function updateDriver(id: string, input: DriverInput): Promise<Driver> {
  const { data, error } = await supabase
    .from("drivers")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Driver;
}

export async function deleteDriver(id: string): Promise<void> {
  const { error } = await supabase.from("drivers").delete().eq("id", id);
  if (error) throw error;
}

// ── Nalog vozača (Edge funkcije; owner upravlja iz aplikacije) ──
// Izvuci poruku greške iz Edge funkcije (telo { error }) — inače generička.
async function fnError(error: unknown, fallback: string): Promise<Error> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  try {
    const body = await ctx?.json?.();
    if (body?.error) return new Error(body.error);
  } catch { /* telo nije JSON */ }
  return new Error((error as Error)?.message ?? fallback);
}

export type DriverCredentials = { email: string; password: string; user_id: string };

// Napravi nalog za postojećeg vozača (bez user_id). Vraća kredencijale (prikazati JEDNOM).
export async function createDriverAccount(driverId: string, email: string, password?: string): Promise<DriverCredentials> {
  const { data, error } = await supabase.functions.invoke("create-driver-account", {
    body: { driver_id: driverId, email, ...(password ? { password } : {}) },
  });
  if (error) throw await fnError(error, "Neuspešno kreiranje naloga");
  return data as DriverCredentials;
}

export async function deleteDriverAccount(driverId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("delete-driver-account", { body: { driver_id: driverId } });
  if (error) throw await fnError(error, "Neuspešno brisanje naloga");
}

// Email naloga vozača (za prikaz). Vraća null ako nema naloga / greška.
export async function getDriverEmail(driverId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("get-driver-email", { body: { driver_id: driverId } });
  if (error) return null;
  return (data as { email: string | null })?.email ?? null;
}
