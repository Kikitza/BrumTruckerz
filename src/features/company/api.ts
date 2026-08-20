// API sloj za onboarding/šifarnike firme — countries, vehicle_types, samouslužno otvaranje.
// Šifarnici: RLS čita svako; write samo platforma (0025). Otvaranje: SECURITY DEFINER RPC.
import { supabase } from "../../lib/supabase";

export type Country = { code: string; name_key: string; eu_member: boolean; sort: number };
export async function listCountries(): Promise<Country[]> {
  const { data, error } = await supabase
    .from("countries").select("code, name_key, eu_member, sort").order("sort", { ascending: true }).order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Country[];
}

export type VehicleType = { id: string; code: string; name_key: string; sort: number };
export async function listVehicleTypes(): Promise<VehicleType[]> {
  const { data, error } = await supabase
    .from("vehicle_types").select("id, code, name_key, sort").order("sort", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VehicleType[];
}

// Samouslužno otvaranje firme (samo NoRole korisnik). Vraća company_id.
export async function createCompanySelf(name: string, countryCode: string | null, baseCurrency: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_company_self", {
    p_name: name, p_country_code: countryCode, p_base_currency: baseCurrency,
  });
  if (error) throw error;
  return data as string;
}
