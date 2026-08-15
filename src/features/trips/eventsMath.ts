// Čiste funkcije nad km-događajima ture (BEZ Supabase importa — testabilno).
// Ulaz je minimalni oblik događaja (i sinhronizovani i pending mogu da se svedu na njega).
export type KmEventLike = { type: string; km?: number | null; stop_id?: string | null };

// Kilometraža polaska = km poslednjeg 'departure' događaja (ili null ako ga nema).
export function departureKm(events: KmEventLike[]): number | null {
  let km: number | null = null;
  for (const e of events) if (e.type === "departure" && e.km != null) km = e.km;
  return km;
}

// Mapa stop_id -> km (poslednji 'stop_arrival' po stanici). Za ✓ + km u prikazu.
export function arrivalsByStop(events: KmEventLike[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of events) {
    if (e.type === "stop_arrival" && e.stop_id && e.km != null) map[e.stop_id] = e.km;
  }
  return map;
}
