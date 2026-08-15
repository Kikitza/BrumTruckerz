// Čiste funkcije/tipovi za stanice ture — BEZ Supabase importa (testabilno u jest-u).
// api.ts ih re-exportuje da ostane jedini „ulaz" za domen, a testovi ih uvoze odavde.
export type TripStopKind = "loading" | "unloading";
// Nacrt stanice (bez id/seq — seq se dodeljuje po redosledu pri čuvanju).
export type TripStopInput = { kind: TripStopKind; place: string; note?: string | null };

// destination = mesto POSLEDNJEG istovara (kompatibilnost sa trips.destination).
// Prazna/bez istovara -> null.
export function destinationFromStops(stops: TripStopInput[]): string | null {
  for (let i = stops.length - 1; i >= 0; i--) {
    const s = stops[i];
    if (s.kind === "unloading" && s.place.trim()) return s.place.trim();
  }
  return null;
}
