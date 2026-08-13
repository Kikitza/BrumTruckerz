// Prilozi (slike dokumenata) — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// U bazi stoji SAMO metapodatak (storage_key); fajl je na Cloudflare R2.
// Upload IDE KROZ OFFLINE RED (ista putanja owner+vozač) -> handler "attachment.upload".
// Presigned URL-ovi (upload/download) dolaze iz Edge funkcije "r2-sign" (RLS odlučuje o pristupu).
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import { enqueue, listPending, removePending } from "../../lib/offline/queue";
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

// Presigned GET URL za prikaz slike (kroz r2-sign; RLS proverava vidljivost priloga).
export async function signDownload(storageKey: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("r2-sign", {
    body: { action: "download", storage_key: storageKey },
  });
  if (error) throw error;
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("r2-sign: nema URL-a");
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
// svojim turama). Briše red u bazi; R2 objekat ostaje siroče (MVP odluka, kao do sada).
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
