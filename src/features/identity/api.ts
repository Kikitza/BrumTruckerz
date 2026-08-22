// API sloj za identitet/pozivnice — JEDINO mesto koje priča sa Supabase-om za ovaj
// domen (konvencija: features/<domen>/api.ts).
//
// Vlasnik: listInvites / createInvite / cancelInvite (RLS: samo svoja firma).
// Primalac: acceptInvitation → RPC accept_invitation (security definer; primalac NEMA
// select na tabelu). RPC greške nose kratak KOD u poruci → mapiramo na i18n u UI.
import { supabase } from "../../lib/supabase";
import { currentUserId, currentCompanyId } from "../auth/currentUser";
import type { InviteStatus } from "./inviteCode";

// ── Moj profil (vozač čita svoj: RLS driver_profiles user_id=auth.uid()) ──
// Telefon dolazi iz auth (session/getUser) — nije u našim tabelama (brava, ne identitet).
export type MyProfile = {
  name: string | null;      // display_name profila, pa full_name naloga
  public_no: string | null; // 'BT-D-#####'
  phone: string | null;     // trenutni auth telefon
};

export async function getMyProfile(): Promise<MyProfile> {
  const uid = await currentUserId();
  const [{ data: prof }, { data: au }, { data: userRes }] = await Promise.all([
    supabase.from("driver_profiles").select("public_no, display_name").eq("user_id", uid).maybeSingle(),
    supabase.from("app_users").select("full_name").eq("id", uid).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  return {
    name: (prof?.display_name as string | null) || (au?.full_name as string | null) || null,
    public_no: (prof?.public_no as string | null) ?? null,
    phone: userRes.user?.phone ?? null,
  };
}

export type InviteRole = "driver" | "dispatcher";

export type Invitation = {
  id: string;
  company_id: string;
  role: InviteRole;
  code: string;
  invited_name: string | null;
  contact_hint: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  status: InviteStatus;
  accepted_by: string | null;
  accepted_at: string | null;
};

export type InviteInput = {
  role: InviteRole;
  invited_name?: string | null;
  contact_hint?: string | null;
};

const COLS =
  "id, company_id, role, code, invited_name, contact_hint, created_by, created_at, expires_at, status, accepted_by, accepted_at";

// Vlasnik čita pozivnice SVOJE firme (RLS invitations_read).
export async function listInvites(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations").select(COLS).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invitation[];
}

// Kreira pozivnicu; KOD generiše baza (default gen_invite_code) → vraćamo ceo red.
export async function createInvite(input: InviteInput): Promise<Invitation> {
  const [company_id, created_by] = await Promise.all([currentCompanyId(), currentUserId()]);
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      company_id,
      created_by,
      role: input.role,
      invited_name: input.invited_name?.trim() || null,
      contact_hint: input.contact_hint?.trim() || null,
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as Invitation;
}

// Otkaz = status='cancelled' (nema delete; istorija se čuva).
export async function cancelInvite(id: string): Promise<void> {
  const { error } = await supabase
    .from("invitations").update({ status: "cancelled" }).eq("id", id);
  if (error) throw error;
}

export type AcceptResult = {
  status: "accepted" | "already_accepted";
  role: InviteRole;
  company_id: string;
};

// Prihvatanje kodom (primalac). Vraća rezultat ili baca Error sa KODOM greške u .message
// (INVITE_NOT_FOUND / INVITE_EXPIRED / INVITE_USED / INVITE_CANCELLED / INVITE_OTHER_COMPANY /
//  INVITE_COMPANY_SUSPENDED / INVITE_DISPATCHER_NOT_READY / INVITE_ROLE_CANNOT_ACCEPT).
export async function acceptInvitation(code: string): Promise<AcceptResult> {
  const { data, error } = await supabase.rpc("accept_invitation", { p_code: code });
  if (error) throw error;
  return data as AcceptResult;
}

// Bootstrap ČISTOG identiteta (radnik bez firme, ADR 0013 dopuna / 0036). Idempotentno.
// Zove se na prvom ulasku kad nalog nema app_users red (nema signup trigera).
export async function ensureIdentity(): Promise<void> {
  const { error } = await supabase.rpc("ensure_identity");
  if (error) throw error;
}
