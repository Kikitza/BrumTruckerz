// API sloj CV pristanaka (v2-3 kriška 3, ADR 0014) — JEDINO mesto koje priča sa Supabase-om
// za ovaj domen. Sav upis kroz SECURITY DEFINER RPC (tabele nemaju INSERT/UPDATE politiku).
//
// Office: cvRequest (zatraži), cvAccess (status na kartici).
// Radnik: myCvRequests / respondCvRequest (odgovori), myCvConsents / revokeCvConsent (upravljaj).
import { supabase } from "../../lib/supabase";

export type CvAccess = "granted" | "requested" | "none";
export type CvRequestResult = { request_id?: string; status: "sent" | "already_pending" | "already_granted" };

// Office traži pun CV radnika (kreira/vraća pending zahtev). Idempotentno.
export async function cvRequest(workerUserId: string): Promise<CvRequestResult> {
  const { data, error } = await supabase.rpc("cv_request", { p_worker: workerUserId });
  if (error) throw error;
  return data as CvRequestResult;
}

// Status odnosa (za mrežnu karticu): granted | requested | none.
export async function cvAccess(workerUserId: string): Promise<CvAccess> {
  const { data, error } = await supabase.rpc("cv_access", { p_worker: workerUserId });
  if (error) throw error;
  return (data as CvAccess) ?? "none";
}

export type CvRequest = { request_id: string; company_id: string; company_name: string; created_at: string };

// Radnik: otvoreni zahtevi upućeni njemu.
export async function myCvRequests(): Promise<CvRequest[]> {
  const { data, error } = await supabase.rpc("my_cv_requests");
  if (error) throw error;
  return (data ?? []) as CvRequest[];
}

// Radnik odgovara: approve → pristanak granted; deny → zatvori zahtev.
export async function respondCvRequest(requestId: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_cv_request", { p_request: requestId, p_approve: approve });
  if (error) throw error;
}

export type CvConsent = { company_id: string; company_name: string; granted_at: string };

// Radnik: firme sa aktivnim pristankom („Ko vidi moj CV").
export async function myCvConsents(): Promise<CvConsent[]> {
  const { data, error } = await supabase.rpc("my_cv_consents");
  if (error) throw error;
  return (data ?? []) as CvConsent[];
}

// Radnik opoziva pristanak → pristup se momentalno gasi.
export async function revokeCvConsent(companyId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_cv_consent", { p_company: companyId });
  if (error) throw error;
}
