// src/lib/offline/handlers.ts
//
// Handleri: kako se svaka vrsta mutacije iz reda IZVRŠAVA na serveru.
// Registruju se jednom iz root layout-a (registerAllHandlers()).
//
// VAŽNO (multivaluta, pravilo #4): kurs se razrešava OVDE, u trenutku sinhronizacije
// — vozač offline unese samo original (iznos + valuta), bez kursa.
// base_amount = round(original * rate, 2) računa KOD.

import { supabase } from "../supabase";
import { registerHandler } from "./queue";
import { getRate } from "../../features/fx/rates";

const round2 = (n: number) => Math.round(n * 100) / 100;

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

  // Trošak (multivaluta): original sa računa; kurs se povlači sad, za datum troška
  registerHandler("expense.insert", async (p: {
    company_id: string; trip_id: string; category: string;
    original_amount: number; original_currency: string;
    base_currency: string;                 // bazna valuta firme (kopira se pri unosu)
    occurred_at: string; liters?: number; country?: string; note?: string;
    fx_rate?: number;                      // opciono: ručno unet/korigovan kurs
  }) => {
    const date = p.occurred_at.slice(0, 10);
    const rate =
      p.fx_rate ??
      (p.original_currency === p.base_currency
        ? 1
        : await getRate(p.original_currency, p.base_currency, date));
    if (rate == null) throw new Error(`Nema kursa ${p.original_currency}->${p.base_currency} za ${date}`);

    const { error } = await supabase.from("expenses").insert({
      company_id: p.company_id,
      trip_id: p.trip_id,
      category: p.category,
      original_amount: p.original_amount,
      original_currency: p.original_currency,
      fx_rate: rate,
      fx_rate_date: date,
      base_amount: round2(p.original_amount * rate),
      base_currency: p.base_currency,
      liters: p.liters ?? null,
      country: p.country ?? null,
      occurred_at: p.occurred_at,
      note: p.note ?? null,
    });
    if (error) throw error;
  });

  // Slika dokumenta: lokalni fajl -> potpisani URL (Edge) -> PUT na R2 -> red u attachments
  registerHandler("attachment.upload", async (_p: {
    company_id: string; trip_id: string; kind: string; local_uri: string;
  }) => {
    // TODO (korak 5 iz CLAUDE.md redosleda):
    //  1) supabase.functions.invoke('sign-upload', { body: { kind, trip_id } }) -> { url, storage_key }
    //  2) fetch(local_uri) -> blob -> PUT url (Content-Type image/jpeg)
    //  3) insert into attachments { company_id, trip_id, kind, storage_key }
    //  4) obriši lokalni fajl (expo-file-system)
    throw new Error("attachment.upload: implementirati uz Edge funkciju sign-upload (v. CLAUDE.md korak 5)");
  });
}
