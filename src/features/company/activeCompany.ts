// Aktivna firma (v2-3, ADR 0013): korisnik sa VIŠE članstava bira u kojoj firmi radi.
// Čita članstva kroz my_memberships() RPC (definer — zaobilazi companies RLS za imena
// SVOJIH firmi); prekidač zove set_active_company() RPC (validira aktivno članstvo).
import { supabase } from "../../lib/supabase";
import type { Role } from "../auth/useSession";

export type Membership = {
  company_id: string;
  company_name: string;
  role: Role;
  is_active: boolean;
};

export async function listMyMemberships(): Promise<Membership[]> {
  const { data, error } = await supabase.rpc("my_memberships");
  if (error) throw error;
  return (data ?? []) as Membership[];
}

export async function setActiveCompany(companyId: string): Promise<void> {
  const { error } = await supabase.rpc("set_active_company", { p_company: companyId });
  if (error) throw error;
}
