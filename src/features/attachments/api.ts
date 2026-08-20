// Prilozi (slike dokumenata) — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// U bazi stoji SAMO metapodatak (storage_key); fajl je u Supabase Storage (privatan bucket
// 'prilozi'). storage_key je backend-agnostičan (company_id/trip_id/uuid.jpg) — R2 je moguća
// kasnija optimizacija bez migracije podataka.
// Upload IDE KROZ OFFLINE RED (ista putanja owner+vozač) -> handler "attachment.upload".
// Pristupom upravljaju storage policy (migracija 0008), ne kod.
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import { enqueue, listPending, removePending } from "../../lib/offline/queue";
import { currentCompanyId } from "../auth/currentUser";
import type { ExpenseCategory } from "../expenses/api";

export type AttachmentKind = "cmr" | "invoice" | "customs" | "fuel_receipt" | "other";

// Vrste dokumenata (za izbor pri kačenju na turu — sekcija „Dokumenti").
export const ATTACHMENT_KINDS: AttachmentKind[] = ["cmr", "invoice", "customs", "fuel_receipt", "other"];

// Prilog troška: gorivo -> „fuel_receipt", ostalo -> „invoice" (deljeno owner+vozač).
export const expenseAttachmentKind = (cat: ExpenseCategory): AttachmentKind =>
  cat === "fuel" ? "fuel_receipt" : "invoice";

export type Attachment = {
  id: string;
  trip_id: string | null;
  expense_id: string | null;
  kind: AttachmentKind;
  storage_key: string;
  created_at: string;
};

// Prilog koji čeka u lokalnom redu (prikaz sa lokalne putanje + bedž).
export type PendingAttachment = {
  queueId: number;
  id: string;
  trip_id: string | null;
  expense_id: string | null;
  kind: AttachmentKind;
  local_uri: string;
};

const ATTACH_COLS = "id, trip_id, expense_id, kind, storage_key, created_at";

// Sinhronizovani prilozi (RLS ograničava: vlasnik firme; vozač samo svoje ture).
export async function listAttachments(
  q: { tripId?: string; expenseId?: string },
): Promise<Attachment[]> {
  let query = supabase.from("attachments").select(ATTACH_COLS).order("created_at", { ascending: true });
  if (q.expenseId) query = query.eq("expense_id", q.expenseId);
  else if (q.tripId) query = query.eq("trip_id", q.tripId);
  else return [];
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Attachment[];
}

// Potpisani (privremeni) GET URL za prikaz slike iz privatnog bucketa 'prilozi'.
// Vidljivost određuje storage policy (0008): owner svoje firme, vozač svoje ture.
const DOWNLOAD_TTL = 600; // sekundi (~10 min)
export async function signDownload(storageKey: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("prilozi")
    .createSignedUrl(storageKey, DOWNLOAD_TTL);
  if (error) throw error;
  const url = data?.signedUrl;
  if (!url) throw new Error("Storage: nema potpisanog URL-a");
  return url;
}

// Ubaci prilog u red (id = klijentski uuid; postaje pk reda u attachments pri sinhr.).
export async function enqueueAttachment(p: {
  id: string;
  trip_id?: string | null;
  expense_id?: string | null;
  kind: AttachmentKind;
  local_uri: string;
}): Promise<void> {
  await enqueue("attachment.upload", {
    id: p.id,
    trip_id: p.trip_id ?? null,
    expense_id: p.expense_id ?? null,
    kind: p.kind,
    local_uri: p.local_uri,
  });
}

// WEB (F3): direktan upload (web je uvek online — bez offline reda). Isti storage ključ
// (company_id/trip_id/uuid.jpg) i pravila (storage policy 0008) kao mobilni. bytes = sadržaj fajla.
export async function uploadAttachmentWeb(p: {
  id: string;
  trip_id?: string | null;
  expense_id?: string | null;
  kind: AttachmentKind;
  bytes: Uint8Array;
  contentType: string;
}): Promise<void> {
  const company_id = await currentCompanyId();
  const trip_id = p.trip_id ?? null;
  const storage_key = `${company_id}/${trip_id}/${p.id}.jpg`; // ext .jpg radi parnosti ključa sa mobilnim
  const { error: upErr } = await supabase.storage
    .from("prilozi").upload(storage_key, p.bytes, { contentType: p.contentType || "image/jpeg", upsert: true });
  if (upErr) throw upErr;
  const { error: insErr } = await supabase.from("attachments").insert({
    id: p.id, company_id, trip_id, expense_id: p.expense_id ?? null, kind: p.kind, storage_key,
  });
  if (insErr) throw insErr;
}

// Prilozi ovog subjekta koji čekaju u redu.
export async function listPendingAttachments(
  q: { tripId?: string; expenseId?: string },
): Promise<PendingAttachment[]> {
  const rows = await listPending("attachment.upload");
  return rows
    .filter((r) =>
      q.expenseId ? r.payload?.expense_id === q.expenseId
        : q.tripId ? r.payload?.trip_id === q.tripId
        : false,
    )
    .map((r) => ({
      queueId: r.id,
      id: r.payload.id,
      trip_id: r.payload.trip_id ?? null,
      expense_id: r.payload.expense_id ?? null,
      kind: r.payload.kind,
      local_uri: r.payload.local_uri,
    }));
}

// Brisanje SINHRONIZOVANOG priloga (owner i vozač — RLS attach_* dozvoljava CRUD nad
// svojim turama). Briše red u bazi; objekat u Storage-u ostaje siroče (MVP odluka, kao do sada).
export async function deleteAttachment(id: string): Promise<void> {
  const { error } = await supabase.from("attachments").delete().eq("id", id);
  if (error) throw error;
}

// Brisanje PENDING priloga PRE sinhronizacije: ukloni stavku iz reda + obriši lokalni fajl.
export async function deletePendingAttachment(queueId: number, localUri: string): Promise<void> {
  await removePending(queueId);
  try {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch {
    // fajl je možda već obrisan/nedostupan — nema posledica po podatke
  }
}
