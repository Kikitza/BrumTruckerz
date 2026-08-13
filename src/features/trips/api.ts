// API sloj za ture — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// PRAVILO #2: vlasnik čita trips/trip_pnl; VOZAČ čita ISKLJUČIVO driver_trips view
// (bez finansija) i mutira kroz offline red -> RPC. Ne menjati te putanje.
// Vlasnik radi ONLINE (bez offline reda) — direktan pristup pod RLS-om.
import { supabase } from "../../lib/supabase";
import { enqueue } from "../../lib/offline/queue";

// ── Tipovi (šema: 0001_init.sql) ──
export type TripStatus = "draft" | "loading" | "driving" | "border" | "unloading" | "finished";
export type EventType = "load" | "unload" | "border" | "driving" | "rest" | "other";
export type DriverPayMode = "per_diem" | "percentage" | "fixed";

export type Trip = {
  id: string;
  company_id: string;
  driver_id: string;
  vehicle_id: string;
  trailer_id: string | null;
  origin: string | null;
  destination: string | null;
  title: string | null; // auto-generisan "origin → destination" (kompatibilnost/izvozi)
  status: TripStatus;
  start_odometer: number | null;
  end_odometer: number | null;
  revenue: number | null;
  driver_pay_mode: DriverPayMode | null;
  driver_pay: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type TripListItem = Pick<
  Trip,
  "id" | "origin" | "destination" | "title" | "status" | "driver_id" | "vehicle_id" | "trailer_id" | "started_at" | "finished_at"
>;

// Detalj sa uvezanim imenima (embedded select preko FK-ova).
export type TripDetail = Trip & {
  driver: { full_name: string } | null;
  vehicle: { registration: string } | null;
  trailer: { registration: string } | null;
};

export type TripEvent = {
  id: string;
  company_id: string;
  trip_id: string;
  type: EventType;
  occurred_at: string;
  location: string | null;
  note: string | null;
  created_at: string;
};

export type CreateTripInput = {
  driver_id: string;
  vehicle_id: string;
  trailer_id?: string | null;
  origin?: string | null;
  destination?: string | null;
  start_odometer?: number | null;
  revenue?: number | null;
};

// title = "origin → destination" (jedno od dva ako drugo fali; null ako oba fale).
export function tripTitle(origin: string | null, destination: string | null): string | null {
  if (origin && destination) return `${origin} → ${destination}`;
  return origin ?? destination ?? null;
}

export type TripFinanceInput = {
  revenue?: number | null;
  driver_pay_mode?: DriverPayMode | null;
  driver_pay?: number | null;
};

export type AddEventInput = {
  trip_id: string;
  type: EventType;
  occurred_at?: string;
  location?: string | null;
  note?: string | null;
};

// Status ture prati poslednji događaj (denormalizovano u trips.status).
// rest/other nemaju odgovarajući status pa ga ne menjaju.
const EVENT_TO_STATUS: Partial<Record<EventType, TripStatus>> = {
  load: "loading",
  driving: "driving",
  border: "border",
  unload: "unloading",
};

// company_id ulogovanog vlasnika (potreban na svakom insertu; RLS ga i proverava).
async function currentCompanyId(): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) throw new Error("Nema aktivne sesije");
  const { data, error } = await supabase
    .from("app_users")
    .select("company_id")
    .eq("id", uid)
    .single();
  if (error) throw error;
  const cid = (data?.company_id as string | null) ?? null;
  if (!cid) throw new Error("Korisnik nije vezan za firmu");
  return cid;
}

// ── VLASNIK ──
export async function ownerListTrips(): Promise<TripListItem[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, origin, destination, title, status, driver_id, vehicle_id, trailer_id, started_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as TripListItem[];
}

export async function ownerCreateTrip(input: CreateTripInput): Promise<Trip> {
  const company_id = await currentCompanyId();
  const origin = input.origin?.trim() || null;
  const destination = input.destination?.trim() || null;
  const { data, error } = await supabase
    .from("trips")
    .insert({
      company_id,
      status: "draft",
      driver_id: input.driver_id,
      vehicle_id: input.vehicle_id,
      trailer_id: input.trailer_id ?? null,
      origin,
      destination,
      title: tripTitle(origin, destination), // generiše kod (za prikaze/izvoze)
      start_odometer: input.start_odometer ?? null,
      revenue: input.revenue ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function ownerGetTrip(tripId: string): Promise<TripDetail> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "*, driver:drivers(full_name), vehicle:vehicles(registration), trailer:trailers(registration)",
    )
    .eq("id", tripId)
    .single();
  if (error) throw error;
  return data as unknown as TripDetail;
}

export async function ownerUpdateTripFinance(tripId: string, input: TripFinanceInput): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .update(input)
    .eq("id", tripId)
    .select()
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function ownerListTripEvents(tripId: string): Promise<TripEvent[]> {
  const { data, error } = await supabase
    .from("trip_events")
    .select("id, company_id, trip_id, type, occurred_at, location, note, created_at")
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TripEvent[];
}

export async function ownerAddTripEvent(input: AddEventInput): Promise<void> {
  const company_id = await currentCompanyId();
  const occurred_at = input.occurred_at ?? new Date().toISOString();
  const { error } = await supabase.from("trip_events").insert({
    company_id,
    trip_id: input.trip_id,
    type: input.type,
    occurred_at,
    location: input.location ?? null,
    note: input.note ?? null,
  });
  if (error) throw error;

  // status ture prati poslednji događaj
  const status = EVENT_TO_STATUS[input.type];
  if (status) {
    const { error: e2 } = await supabase.from("trips").update({ status }).eq("id", input.trip_id);
    if (e2) throw e2;
  }
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
