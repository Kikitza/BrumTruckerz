// API sloj za platform admin — SVE ide kroz RPC-ove (security definer + provera role
// u bazi). Admin NEMA direktan RLS pristup tabelama firmi (poslovni sadržaj nedostupan).
import { supabase } from "../../lib/supabase";

export type CompanyStatus = "active" | "suspended";

export type AdminCompany = {
  id: string;
  name: string;
  plan: string;
  vehicle_limit: number;
  vehicles_used: number;
  drivers_used: number;
  owner_emails: string | null;
  status: CompanyStatus;
  paid_until: string | null;
  billing_note: string | null;
  created_at: string;
};

export async function adminListCompanies(): Promise<AdminCompany[]> {
  const { data, error } = await supabase.rpc("admin_list_companies");
  if (error) throw error;
  return (data ?? []) as AdminCompany[];
}

export async function adminSetCompanyPlan(companyId: string, plan: string, vehicleLimit: number): Promise<void> {
  const { error } = await supabase.rpc("admin_set_company_plan", {
    p_company_id: companyId, p_plan: plan, p_vehicle_limit: vehicleLimit,
  });
  if (error) throw error;
}

export async function adminSetCompanyStatus(
  companyId: string, status: CompanyStatus, paidUntil: string | null, billingNote: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_company_status", {
    p_company_id: companyId, p_status: status, p_paid_until: paidUntil, p_billing_note: billingNote,
  });
  if (error) throw error;
}

// Suspension gate: owner/driver čitaju status SVOJE firme (RLS company_read → samo svoja).
// FAIL-CLOSED (audit A3): greška čitanja -> baci (pozivalac blokira dok ne potvrdi
// status, nikad ne pušta unutra na osnovu neuspele provere). Nema reda -> tretiraj
// kao obustavljeno (fail-closed).
export async function getMyCompanyStatus(): Promise<CompanyStatus> {
  const { data, error } = await supabase.from("companies").select("status").limit(1).maybeSingle();
  if (error) throw error;
  return (data?.status as CompanyStatus) ?? "suspended";
}
