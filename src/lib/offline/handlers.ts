// src/lib/offline/handlers.ts
//
// Handleri: kako se svaka vrsta mutacije iz reda IZVRŠAVA na serveru.
// Registruju se jednom iz root layout-a (registerAllHandlers()).
//
// VAŽNO (multivaluta, pravilo #4): kurs se razrešava OVDE, u trenutku sinhronizacije
// — vozač offline unese samo original (iznos + valuta), bez kursa.
// base_amount = round(original * rate, 2) računa KOD.

import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../supabase";
import { registerHandler } from "./queue";
import { computeBase } from "../../features/fx/rates";

const DUP_PK = "23505"; // Postgres unique_violation — ponovljen upis (retry) tretiramo kao uspeh

export function registerAllHandlers() {
  // Nov događaj ture (utovar/granica/istovar…)
  registerHandler("trip_event.insert", async (p: {
    company_id: string; trip_id: string; type: string;
    occurred_at: string; location?: string; note?: string;
  }) => {
    const { error } = await supabase.from("trip_events").insert(p);
    if (error) throw error;
  });

  // Ispravka događaja — ISKLJUČIVO kroz RPC (append-only, istorija ostaje)
  registerHandler("trip_event.correct", async (p: {
    event_id: string; type?: string; occurred_at?: string;
    location?: string; note?: string; comment?: string;
  }) => {
    const { error } = await supabase.rpc("correct_trip_event", {
      p_event_id: p.event_id,
      p_type: p.type ?? null,
      p_occurred_at: p.occurred_at ?? null,
      p_location: p.location ?? null,
      p_note: p.note ?? null,
      p_comment: p.comment ?? null,
    });
    if (error) throw error;
  });

  // Napredovanje ture (status / završna km) — RPC, nikad direktan update trips
  registerHandler("trip.progress", async (p: {
    trip_id: string; status?: string; end_odometer?: number;
  }) => {
    const { error } = await supabase.rpc("driver_update_trip_progress", {
      p_trip_id: p.trip_id,
      p_status: p.status ?? null,
      p_end_odometer: p.end_odometer ?? null,
    });
    if (error) throw error;
  });

  // Trošak (multivaluta): original sa računa; kurs se povlači sad, za datum troška.
  // id je klijentski (uuid) da bi prilozi mogli da ga referišu i pre sinhronizacije;
  // ponovni pokušaj (isti id) = konflikt na pk => tretira se kao uspeh (idempotentno).
  registerHandler("expense.insert", async (p: {
    id?: string;
    company_id: string; trip_id: string; category: string;
    original_amount: number; original_currency: string;
    base_currency: string;                 // bazna valuta firme (kopira se pri unosu)
    occurred_at: string; liters?: number; country?: string; note?: string;
    fx_rate?: number;                      // opciono: ručno unet/korigovan kurs
  }) => {
    const date = p.occurred_at.slice(0, 10);
    // Ista matematika kao owner online putanja (features/expenses/api.ts).
    const { fx_rate, fx_rate_date, base_amount } = await computeBase(
      p.original_amount, p.original_currency, p.base_currency, date, p.fx_rate,
    );

    const { error } = await supabase.from("expenses").insert({
      ...(p.id ? { id: p.id } : {}),
      company_id: p.company_id,
      trip_id: p.trip_id,
      category: p.category,
      original_amount: p.original_amount,
      original_currency: p.original_currency,
      fx_rate,
      fx_rate_date,
      base_amount,
      base_currency: p.base_currency,
      liters: p.liters ?? null,
      country: p.country ?? null,
      occurred_at: p.occurred_at,
      note: p.note ?? null,
    });
    if (error && error.code !== DUP_PK) throw error;
  });

  // Slika dokumenta: r2-sign(upload) -> PUT na presigned R2 URL -> insert u attachments -> obriši lokalni fajl.
  // Neuspeh bilo gde => throw => stavka ostaje u redu (postojeći backoff). FIFO: prilog troška ide
  // posle expense.insert, pa expense red već postoji kad r2-sign proverava pristup kroz RLS.
  registerHandler("attachment.upload", async (p: {
    id: string; trip_id?: string | null; expense_id?: string | null; kind: string; local_uri: string;
  }) => {
    // 1) presigned PUT + server-generisan storage_key (+ company_id/trip_id iz RLS reda)
    const { data, error } = await supabase.functions.invoke("r2-sign", {
      body: { action: "upload", kind: p.kind, trip_id: p.trip_id, expense_id: p.expense_id },
    });
    if (error) throw error;
    const { url, storage_key, company_id, trip_id } = data as {
      url: string; storage_key: string; company_id: string; trip_id: string | null;
    };

    // 2) PUT lokalnog fajla na R2 (binarni upload)
    const put = await FileSystem.uploadAsync(url, p.local_uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { "Content-Type": "image/jpeg" },
    });
    if (put.status < 200 || put.status >= 300) throw new Error(`R2 PUT ${put.status}`);

    // 3) insert reda u attachments (id = klijentski uuid; retry -> pk konflikt = uspeh)
    const { error: insErr } = await supabase.from("attachments").insert({
      id: p.id,
      company_id,
      trip_id: trip_id ?? p.trip_id ?? null,
      expense_id: p.expense_id ?? null,
      kind: p.kind,
      storage_key,
    });
    if (insErr && insErr.code !== DUP_PK) throw insErr;

    // 4) obriši lokalni fajl (best-effort — ne obara sinhronizaciju)
    try {
      await FileSystem.deleteAsync(p.local_uri, { idempotent: true });
    } catch {
      // ignoriši; fajl će ostati u document dir-u, bez posledica po podatke
    }
  });
}
