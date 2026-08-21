// API sloj za ture — JEDINO mesto koje priča sa Supabase-om za ovaj domen.
// PRAVILO #2: vlasnik čita trips/trip_pnl; VOZAČ čita ISKLJUČIVO driver_trips view
// (bez finansija) i mutira kroz offline red -> RPC. Ne menjati te putanje.
// Vlasnik radi ONLINE (bez offline reda) — direktan pristup pod RLS-om.
import { supabase } from "../../lib/supabase";
import { enqueue } from "../../lib/offline/queue";
import { uuidv4 } from "../../lib/uuid";
import { destinationFromStops, reconcileStops } from "./stopsMath";
import type { TripStopKind, TripStopInput, StopDraftLike, CountrySource } from "./stopsMath";

// Re-export (jedini domen-ulaz je api.ts; čiste funkcije/tipovi žive u ./stopsMath).
export { destinationFromStops };
export type { TripStopKind, TripStopInput, CountrySource } from "./stopsMath";

// ── Tipovi (šema: 0001_init.sql) ──
export type TripStatus = "draft" | "loading" | "driving" | "border" | "unloading" | "finished";
export type EventType = "load" | "unload" | "border" | "driving" | "rest" | "other" | "departure" | "stop_arrival";
// Događaji sa kilometražom (kriška B): polazak / dolazak na stanicu / granica.
export type KmEventType = "departure" | "stop_arrival" | "border";
export type DriverPayMode = "per_diem" | "percentage" | "fixed";

export type Trip = {
  id: string;
  company_id: string;
  driver_id: string;
  vehicle_id: string;
  trailer_id: string | null;
  origin: string | null;
  destination: string | null;
  origin_country_code: string | null;             // zemlja polaznog mesta (0028), odvojeno polje
  origin_country_source: CountrySource | null;    // 'auto' (aplikacija pogodila) | 'manual' (potvrdio čovek)
  title: string | null; // auto-generisan "origin → destination" (kompatibilnost/izvozi)
  status: TripStatus;
  start_odometer: number | null;
  end_odometer: number | null;
  revenue: number | null;
  driver_pay_mode: DriverPayMode | null;
  driver_pay: number | null;
  customer_id: string | null;   // naručilac (0021), opciono
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
  customer: { name: string } | null;
};

export type TripEvent = {
  id: string;
  company_id: string;
  trip_id: string;
  type: EventType;
  occurred_at: string;
  km: number | null;        // očitana kilometraža (departure/stop_arrival/border)
  stop_id: string | null;   // veza ka stanici (stop_arrival)
  location: string | null;
  note: string | null;
  created_at: string;
};

export type CreateTripInput = {
  driver_id: string;
  vehicle_id: string;
  trailer_id?: string | null;
  origin?: string | null;
  origin_country_code?: string | null;            // zemlja polaska (0028), opciono
  origin_country_source?: CountrySource | null;
  destination?: string | null; // ignoriše se ako su prosleđene stanice (izvodi se iz njih)
  start_odometer?: number | null;
  revenue?: number | null;
  customer_id?: string | null; // naručilac (0021), opciono
  stops?: TripStopInput[]; // ako postoje: čuvaju se u trip_stops, destination = poslednji istovar
};

// title = "origin → destination" (jedno od dva ako drugo fali; null ako oba fale).
export function tripTitle(origin: string | null, destination: string | null): string | null {
  if (origin && destination) return `${origin} → ${destination}`;
  return origin ?? destination ?? null;
}

// Arhivirana tura = ISKLJUČIVO završena ('finished'). Ture traju danima
// (npr. BG→Minhen), pa datum polaska NIJE kriterijum — tura u vožnji od prekjuče
// mora ostati aktivna. Draftovi i sve u toku ostaju aktivni bez obzira na datum.
// Jedini izvor istine: koristi ga i lista (sekcija "Arhiva") i detalj (dodela read-only).
// (Auto-arhiviranje po datumu = buduća opcija kad uvedemo planirani datum ture.)
export function isTripArchived(t: Pick<Trip, "status">): boolean {
  return t.status === "finished";
}

export type TripFinanceInput = {
  revenue?: number | null;
  driver_pay_mode?: DriverPayMode | null;
  driver_pay?: number | null;
};

// Zamena dodele (vozač/vozilo/prikolica). NE dira finansije (vozarina/valuta/P&L).
export type TripAssignmentInput = {
  driver_id: string;
  vehicle_id: string;
  trailer_id: string | null;
};

// ── Stanice ture (0010): uređen niz utovara/istovara ──
// Red iz baze (kind/input tipovi + destinationFromStops su u ./stopsMath, re-eksportovani gore).
export type TripStop = {
  id: string;
  trip_id: string;
  seq: number;
  kind: TripStopKind;
  place: string;
  note: string | null;
  country_code: string | null;                 // zemlja stanice (0028)
  country_source: CountrySource | null;
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

// Bogat red za desktop tabelu (F3): + naručilac/vozač/vozilo/vozarina (office vidi kroz RLS).
export type TripRichRow = {
  id: string; origin: string | null; destination: string | null; status: TripStatus;
  started_at: string | null; finished_at: string | null; created_at: string; revenue: number | null;
  customer: { name: string } | null; driver: { full_name: string } | null; vehicle: { registration: string } | null;
};
export async function ownerListTripsRich(limit = 50): Promise<TripRichRow[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, origin, destination, status, started_at, finished_at, created_at, revenue, customer:customers(name), driver:drivers(full_name), vehicle:vehicles(registration)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as TripRichRow[];
}

// Server paginacija (F3): aktivne i arhiva zasebno, „Učitaj još" raste limit po 50.
export async function ownerListActiveTrips(limit = 50): Promise<TripListItem[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, origin, destination, title, status, driver_id, vehicle_id, trailer_id, started_at, finished_at")
    .neq("status", "finished")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TripListItem[];
}
export async function ownerListArchivedTrips(limit = 50): Promise<TripListItem[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, origin, destination, title, status, driver_id, vehicle_id, trailer_id, started_at, finished_at")
    .eq("status", "finished")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as TripListItem[];
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
  // Sanitizacija stanica: trim mesta, izbaci prazne, zadrži redosled unosa.
  const stops = (input.stops ?? [])
    .map((s) => ({
      kind: s.kind, place: s.place.trim(), note: s.note?.trim() || null,
      country_code: s.country_code ?? null, country_source: s.country_source ?? null,
    }))
    .filter((s) => s.place);
  const destination = stops.length ? destinationFromStops(stops) : input.destination?.trim() || null;

  const { data, error } = await supabase
    .from("trips")
    .insert({
      company_id,
      status: "draft",
      driver_id: input.driver_id,
      vehicle_id: input.vehicle_id,
      trailer_id: input.trailer_id ?? null,
      origin,
      origin_country_code: input.origin_country_code ?? null,
      origin_country_source: input.origin_country_source ?? null,
      destination,
      title: tripTitle(origin, destination), // generiše kod (za prikaze/izvoze)
      start_odometer: input.start_odometer ?? null,
      revenue: input.revenue ?? null,
      customer_id: input.customer_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const trip = data as Trip;

  if (stops.length) {
    const rows = stops.map((s, i) => ({
      trip_id: trip.id, seq: i + 1, kind: s.kind, place: s.place, note: s.note,
      country_code: s.country_code, country_source: s.country_source,
    }));
    const { error: e2 } = await supabase.from("trip_stops").insert(rows);
    if (e2) throw e2;
  }
  return trip;
}

// Stanice ture (uređeno po seq). Owner i vozač koriste isti upit — RLS razlučuje pristup.
export async function listTripStops(tripId: string): Promise<TripStop[]> {
  const { data, error } = await supabase
    .from("trip_stops")
    .select("id, trip_id, seq, kind, place, note, country_code, country_source")
    .eq("trip_id", tripId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TripStop[];
}

// Izmena RUTE ture (reverzibilnost): polazno mesto, početna km i stanice.
// Reconcile stanica (obriši uklonjene, ubaci nove, ažuriraj postojeće; seq po novom
// redosledu). trips.destination se ponovo izračuna. VOZARINA I DODELA se NE diraju.
export type UpdateTripRouteInput = {
  origin: string | null;
  origin_country_code?: string | null;            // zemlja polaska (0028)
  origin_country_source?: CountrySource | null;
  startOdometer?: number | null; // undefined = ne diraj
  stops: StopDraftLike[];
};

export async function ownerUpdateTripRoute(tripId: string, input: UpdateTripRouteInput): Promise<void> {
  const existing = await listTripStops(tripId);
  const plan = reconcileStops(existing.map((s) => s.id), input.stops);

  if (plan.toDelete.length) {
    const { error } = await supabase.from("trip_stops").delete().in("id", plan.toDelete);
    if (error) throw error;
  }
  for (const u of plan.toUpdate) {
    const { error } = await supabase
      .from("trip_stops")
      .update({ seq: u.seq, kind: u.kind, place: u.place, note: u.note, country_code: u.country_code, country_source: u.country_source })
      .eq("id", u.id);
    if (error) throw error;
  }
  if (plan.toInsert.length) {
    const rows = plan.toInsert.map((r) => ({
      trip_id: tripId, seq: r.seq, kind: r.kind, place: r.place, note: r.note,
      country_code: r.country_code, country_source: r.country_source,
    }));
    const { error } = await supabase.from("trip_stops").insert(rows);
    if (error) throw error;
  }

  const origin = input.origin?.trim() || null;
  const destination = destinationFromStops(input.stops.map((d) => ({ kind: d.kind, place: d.place, note: d.note })));
  const patch: Record<string, unknown> = {
    origin, destination, title: tripTitle(origin, destination),
    origin_country_code: input.origin_country_code ?? null,
    origin_country_source: input.origin_country_source ?? null,
  };
  if (input.startOdometer !== undefined) patch.start_odometer = input.startOdometer;

  const { error } = await supabase.from("trips").update(patch).eq("id", tripId);
  if (error) throw error;
}

export async function ownerGetTrip(tripId: string): Promise<TripDetail> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "*, driver:drivers(full_name), vehicle:vehicles(registration), trailer:trailers(registration), customer:customers(name)",
    )
    .eq("id", tripId)
    .single();
  if (error) throw error;
  return data as unknown as TripDetail;
}

// Postavi/ukloni naručioca ture (office; ne dira dodelu/vozarinu). null = bez naručioca.
export async function ownerUpdateTripCustomer(tripId: string, customerId: string | null): Promise<void> {
  const { error } = await supabase.from("trips").update({ customer_id: customerId }).eq("id", tripId);
  if (error) throw error;
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

// Zamena dodele na postojećoj turi. Menja ISKLJUČIVO driver_id/vehicle_id/trailer_id —
// vozarina, valuta i P&L se ne diraju (pravilo vlasnika proizvoda). RLS vlasnika dozvoljava update.
export async function ownerUpdateTripAssignment(tripId: string, input: TripAssignmentInput): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .update({
      driver_id: input.driver_id,
      vehicle_id: input.vehicle_id,
      trailer_id: input.trailer_id,
    })
    .eq("id", tripId)
    .select()
    .single();
  if (error) throw error;
  return data as Trip;
}

const TRIP_EVENT_COLS = "id, company_id, trip_id, type, occurred_at, km, stop_id, location, note, created_at";

async function selectTripEvents(tripId: string): Promise<TripEvent[]> {
  const { data, error } = await supabase
    .from("trip_events")
    .select(TRIP_EVENT_COLS)
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TripEvent[];
}

// Owner i vozač koriste isti upit — RLS razlučuje pristup (events_select_driver, 0009).
export const ownerListTripEvents = selectTripEvents;
export const driverListTripEvents = selectTripEvents;

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
  // klijentski uuid => idempotentno na retry (audit B2)
  await enqueue("trip_event.insert", { id: uuidv4(), occurred_at: new Date().toISOString(), ...p });
}

// Događaj sa kilometražom (polazak/stanica/granica) — kroz offline red, klijentski
// uuid (idempotentno). 'departure' šalje i start_odometer (RPC upiše na turi).
export async function driverAddKmEvent(p: {
  company_id: string; trip_id: string; type: KmEventType;
  km: number; stop_id?: string | null; note?: string | null;
}) {
  await enqueue("trip_event.km", {
    id: uuidv4(),
    occurred_at: new Date().toISOString(),
    company_id: p.company_id,
    trip_id: p.trip_id,
    type: p.type,
    km: p.km,
    stop_id: p.stop_id ?? null,
    note: p.note ?? null,
    ...(p.type === "departure" ? { start_odometer: p.km } : {}),
  });
}

export async function driverCorrectEvent(p: {
  event_id: string; type?: string; occurred_at?: string;
  location?: string; note?: string; comment?: string;
}) {
  // klijentski uuid nove verzije => RPC idempotentan na retry (audit B3)
  await enqueue("trip_event.correct", { new_id: uuidv4(), ...p });
}

export async function driverProgress(p: {
  trip_id: string; status?: string; end_odometer?: number;
}) {
  await enqueue("trip.progress", p);
}
