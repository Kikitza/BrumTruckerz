// API sloj za ture — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// PRAVILO #2: vlasnik čita trips/trip_pnl; VOZAČ čita ISKLJUČIVO driver_trips view
// (bez finansija) i mutira kroz offline red -> RPC. Ne menjati te putanje.
import { supabase } from "../../lib/supabase";
import { enqueue } from "../../lib/offline/queue";

// ── VLASNIK ──
export async function ownerListTrips() {
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, status, driver_id, vehicle_id, trailer_id, started_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function ownerTripPnl(tripId: string) {
  const { data, error } = await supabase
    .from("trip_pnl").select("*").eq("trip_id", tripId).single();
  if (error) throw error;
  return data;
}

// ── VOZAČ (offline-first: sve mutacije kroz red) ──
export async function driverListTrips() {
  const { data, error } = await supabase
    .from("driver_trips").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function driverAddEvent(p: {
  company_id: string; trip_id: string; type: string;
  occurred_at?: string; location?: string; note?: string;
}) {
  await enqueue("trip_event.insert", { occurred_at: new Date().toISOString(), ...p });
}

export async function driverCorrectEvent(p: {
  event_id: string; type?: string; occurred_at?: string;
  location?: string; note?: string; comment?: string;
}) {
  await enqueue("trip_event.correct", p);
}

export async function driverProgress(p: {
  trip_id: string; status?: string; end_odometer?: number;
}) {
  await enqueue("trip.progress", p);
}
