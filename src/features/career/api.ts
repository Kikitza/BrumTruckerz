// Karijerni profil (CV) — API sloj (jedini koji priča sa Supabase-om za ovaj domen).
// Sve kroz READ-ONLY SECURITY DEFINER RPC-ove (migracija 0027) koji sami rešavaju
// autorizaciju (self | company | none). `userId` je null/undefined za „moj CV".
import { supabase } from "../../lib/supabase";

export type CareerHeader = { public_no: string | null; display_name: string | null };
export type CareerSummary = {
  total_km: number; trips_count: number; companies_count: number; tenure_days: number;
};
export type EmploymentRole = "driver" | "dispatcher";
export type CareerEmployment = {
  company_id: string; company_name: string; role_on_company: EmploymentRole;
  started_at: string; ended_at: string | null; status: "active" | "ended";
};
export type CareerKmPoint = { year_month: string; total_km: number; trips_count: number };

const arg = (userId?: string | null) => ({ p_user: userId ?? null });
const num = (v: unknown) => Number(v ?? 0); // bigint može stići kao string

export async function getCareerHeader(userId?: string | null): Promise<CareerHeader> {
  const { data, error } = await supabase.rpc("career_header", arg(userId));
  if (error) throw error;
  const row = (data ?? [])[0] as CareerHeader | undefined;
  return { public_no: row?.public_no ?? null, display_name: row?.display_name ?? null };
}

export async function getCareerSummary(userId?: string | null): Promise<CareerSummary> {
  const { data, error } = await supabase.rpc("career_summary", arg(userId));
  if (error) throw error;
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  return {
    total_km: num(row?.total_km),
    trips_count: num(row?.trips_count),
    companies_count: num(row?.companies_count),
    tenure_days: num(row?.tenure_days),
  };
}

export async function getCareerEmployments(userId?: string | null): Promise<CareerEmployment[]> {
  const { data, error } = await supabase.rpc("career_employments", arg(userId));
  if (error) throw error;
  return (data ?? []) as CareerEmployment[];
}

export async function getCareerKmSeries(userId?: string | null): Promise<CareerKmPoint[]> {
  const { data, error } = await supabase.rpc("career_km_series", arg(userId));
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    year_month: String(r.year_month),
    total_km: num(r.total_km),
    trips_count: num(r.trips_count),
  }));
}
