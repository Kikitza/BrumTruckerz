// Deljeni helperi za identitet ulogovanog korisnika (bez dupliranja po feature-ima).
// Owner tokovi upisuju company_id na svaki red (pravilo #1); vrednost dolazi odavde.
import { supabase } from "../../lib/supabase";

// auth.uid ulogovanog korisnika.
export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Nema aktivne sesije");
  return uid;
}

// company_id ulogovanog korisnika (RLS ga i proverava na upisu).
export async function currentCompanyId(): Promise<string> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("app_users").select("company_id").eq("id", uid).single();
  if (error) throw error;
  const cid = (data?.company_id as string | null) ?? null;
  if (!cid) throw new Error("Korisnik nije vezan za firmu");
  return cid;
}
