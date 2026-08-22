// API sloj MREŽE (v2-3 kriška 2, ADR 0014) — JEDINO mesto koje priča sa Supabase-om
// za ovaj domen (konvencija: features/<domen>/api.ts).
//
// Radnik: getMyNetworkProfile / upsertMyNetworkProfile (RLS np_self: user_id=auth.uid()),
//         listMyNetworkInvites / declineNetworkInvite (definer RPC), prihvatanje = acceptInvitation.
// Office: searchNetwork (definer RPC → JAVNE KARTICE BEZ PII) / inviteWorker (definer RPC).
import { supabase } from "../../lib/supabase";
import { currentUserId } from "../auth/currentUser";
import { buildSearchParams, type NetworkFilters } from "./searchParams";

export type SeekingRole = "driver" | "dispatcher";

// Profil radnika (SAMO svoj — RLS). certificates su SAMODEKLARISANI (jsonb niz stringova).
export type NetworkProfile = {
  visibility: "private" | "visible";
  seeking_role: SeekingRole | null;
  countries_of_interest: string[];
  languages: string[];
  available_from: string | null;
  certificates: unknown; // jsonb — normalizuje se preko certList()
  note: string | null;
};

const PROFILE_COLS =
  "visibility, seeking_role, countries_of_interest, languages, available_from, certificates, note";

// Radnik čita SVOJ mrežni profil (može ne postojati → null = još nije napravljen).
export async function getMyNetworkProfile(): Promise<NetworkProfile | null> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("network_profiles").select(PROFILE_COLS).eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return (data as NetworkProfile | null) ?? null;
}

// Kreira/ažurira SVOJ profil (upsert po user_id). Triger validira zemlje interesa (ISO ⊆ countries)
// i postavlja updated_at. Baca Error sa 'INVALID_COUNTRY' ako je zemlja van šifarnika.
export async function upsertMyNetworkProfile(patch: NetworkProfile): Promise<void> {
  const uid = await currentUserId();
  const { error } = await supabase.from("network_profiles").upsert({ user_id: uid, ...patch });
  if (error) throw error;
}

// ── Office pretraga: JAVNE KARTICE BEZ PII (definer RPC) ──
export type NetworkCard = {
  user_id: string;
  public_no: string | null; // BT-D/BT-T — trajni javni identifikator (dozvoljen na kartici)
  seeking_role: SeekingRole | null;
  countries_of_interest: string[];
  languages: string[];
  available_from: string | null;
  certificates: unknown;
  note: string | null;
};

export async function searchNetwork(filters: NetworkFilters, page = 0): Promise<NetworkCard[]> {
  const { data, error } = await supabase.rpc("network_search", buildSearchParams(filters, page));
  if (error) throw error;
  return (data ?? []) as NetworkCard[];
}

export type InviteSentResult = { invite_id: string; code: string; status: "sent" | "already_pending" };

// Office poziva radnika → ciljana pozivnica (ista kapija) + event. Idempotentno.
export async function inviteWorker(targetUserId: string, role: SeekingRole): Promise<InviteSentResult> {
  const { data, error } = await supabase.rpc("network_invite", { p_target: targetUserId, p_role: role });
  if (error) throw error;
  return data as InviteSentResult;
}

// ── Radnikovi pozivi (upućeni njemu) ──
export type NetworkInvite = {
  invite_id: string;
  code: string;
  company_id: string;
  company_name: string;
  role: SeekingRole;
  created_at: string;
};

export async function listMyNetworkInvites(): Promise<NetworkInvite[]> {
  const { data, error } = await supabase.rpc("my_network_invites");
  if (error) throw error;
  return (data ?? []) as NetworkInvite[];
}

// Odbijanje poziva (status → cancelled). Baca 'INVITE_NOT_FOUND' ako nije njegov/pending.
export async function declineNetworkInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_network_invite", { p_invite: inviteId });
  if (error) throw error;
}
