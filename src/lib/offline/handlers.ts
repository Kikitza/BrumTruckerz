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
import { base64ToBytes } from "../base64";

const PRILOZI_BUCKET = "prilozi"; // privatan Supabase Storage bucket (v. migracija 0008)

const DUP_PK = "23505"; // Postgres unique_violation — ponovljen upis (retry) tretiramo kao uspeh

export function registerAllHandlers() {
  // Nov događaj ture (utovar/granica/istovar…). Klijentski uuid => idempotentno
  // (retry = pk konflikt = uspeh), isto kao ostali handleri (audit B2).
  registerHandler("trip_event.insert", async (p: {
    id?: string; company_id: string; trip_id: string; type: string;
    occurred_at: string; location?: string; note?: string;
  }) => {
    const { error } = await supabase.from("trip_events").insert({
      ...(p.id ? { id: p.id } : {}),
      company_id: p.company_id,
      trip_id: p.trip_id,
      type: p.type,
      occurred_at: p.occurred_at,
      location: p.location ?? null,
      note: p.note ?? null,
    });
    if (error && error.code !== DUP_PK) throw error;
  });

  // Događaj sa KILOMETRAŽOM (polazak/stanica/granica). Klijentski uuid => idempotentno
  // (retry = pk konflikt = uspeh). Za 'departure' se dodatno upiše/potvrdi start_odometer
  // na turi kroz RPC (vozač ne dira trips direktno) — event je istina.
  registerHandler("trip_event.km", async (p: {
    id: string; company_id: string; trip_id: string;
    type: "departure" | "stop_arrival" | "border";
    km: number; stop_id?: string | null; occurred_at: string;
    location?: string | null; note?: string | null; start_odometer?: number;
  }) => {
    const { error } = await supabase.from("trip_events").insert({
      id: p.id,
      company_id: p.company_id,
      trip_id: p.trip_id,
      type: p.type,
      occurred_at: p.occurred_at,
      km: p.km,
      stop_id: p.stop_id ?? null,
      location: p.location ?? null,
      note: p.note ?? null,
    });
    if (error && error.code !== DUP_PK) throw error;

    if (p.start_odometer != null) {
      const { error: e2 } = await supabase.rpc("driver_update_trip_progress", {
        p_trip_id: p.trip_id,
        p_start_odometer: p.start_odometer,
      });
      if (e2) throw e2;
    }
  });

  // Ispravka događaja — ISKLJUČIVO kroz RPC (append-only, istorija ostaje).
  // Klijentski uuid nove verzije (p_new_id) => RPC je idempotentan: retry posle
  // uspešnog upisa vraća isti id umesto da doda dupli ispravak (audit B3).
  registerHandler("trip_event.correct", async (p: {
    event_id: string; new_id: string; type?: string; occurred_at?: string;
    location?: string; note?: string; comment?: string;
  }) => {
    const { error } = await supabase.rpc("correct_trip_event", {
      p_event_id: p.event_id,
      p_new_id: p.new_id,
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

  // Slika dokumenta: upload u Supabase Storage ('prilozi') -> insert u attachments -> obriši lokalni fajl.
  // Neuspeh bilo gde => throw => stavka ostaje u redu (postojeći backoff). Payload je NEPROMENJEN u odnosu
  // na R2 varijantu ({id, trip_id, expense_id, kind, local_uri}) — zaostale pending slike prolaze isti put.
  // Pristup NE proverava kod, već storage policy (0008): owner po prvom segmentu (firma), vozač po drugom
  // (svoja tura) — isto pravilo kao attach_owner/attach_driver. storage_key je backend-agnostičan.
  registerHandler("attachment.upload", async (p: {
    id: string; trip_id?: string | null; expense_id?: string | null; kind: string; local_uri: string;
  }) => {
    // 1) company_id iz app_users (preko postojećeg RLS helpera) -> prvi segment putanje
    const { data: company_id, error: cErr } = await supabase.rpc("current_company_id");
    if (cErr) throw cErr;
    if (!company_id) throw new Error("nema firme za korisnika");

    // storage_key = company_id/trip_id/uuid.jpg; uuid = id priloga => deterministički (retry idempotentan)
    const trip_id = p.trip_id ?? null;
    const storage_key = `${company_id}/${trip_id}/${p.id}.jpg`;

    // 2) lokalni fajl -> base64 -> bajtovi (RN: upload ide preko ArrayBufferView, ne Blob/FormData)
    const b64 = await FileSystem.readAsStringAsync(p.local_uri, { encoding: "base64" });
    const bytes = base64ToBytes(b64);

    // 3) upload u privatan bucket (upsert => ponovni pokušaj piše isti ključ, bez siročeta)
    const { error: upErr } = await supabase.storage
      .from(PRILOZI_BUCKET)
      .upload(storage_key, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;

    // 4) insert reda u attachments (id = klijentski uuid; retry -> pk konflikt = uspeh)
    const { error: insErr } = await supabase.from("attachments").insert({
      id: p.id,
      company_id,
      trip_id,
      expense_id: p.expense_id ?? null,
      kind: p.kind,
      storage_key,
    });
    if (insErr && insErr.code !== DUP_PK) throw insErr;

    // 5) obriši lokalni fajl (best-effort — ne obara sinhronizaciju)
    try {
      await FileSystem.deleteAsync(p.local_uri, { idempotent: true });
    } catch {
      // ignoriši; fajl će ostati u document dir-u, bez posledica po podatke
    }
  });
}
