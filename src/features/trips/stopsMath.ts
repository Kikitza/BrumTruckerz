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

// ── Reconcile stanica pri izmeni ture (čista funkcija, testabilno) ──
// Nacrt sa vezom ka postojećem redu (existingId) ili nov (null). Prazna mesta se
// preskaču. seq = pozicija u NOVOM redosledu (1-baziran). Vraća plan izmena:
// obriši uklonjene, ubaci nove, ažuriraj postojeće.
export type StopDraftLike = { existingId: string | null; kind: TripStopKind; place: string; note: string };
export type StopRow = { seq: number; kind: TripStopKind; place: string; note: string | null };
export type StopReconcile = {
  toDelete: string[];
  toInsert: StopRow[];
  toUpdate: (StopRow & { id: string })[];
};

export function reconcileStops(existingIds: string[], drafts: StopDraftLike[]): StopReconcile {
  const clean = drafts
    .map((d) => ({ existingId: d.existingId, kind: d.kind, place: d.place.trim(), note: d.note.trim() || null }))
    .filter((d) => d.place);

  const keptIds = new Set(clean.map((d) => d.existingId).filter((x): x is string => x != null));
  const toDelete = existingIds.filter((id) => !keptIds.has(id));

  const toInsert: StopRow[] = [];
  const toUpdate: (StopRow & { id: string })[] = [];
  clean.forEach((d, i) => {
    const row: StopRow = { seq: i + 1, kind: d.kind, place: d.place, note: d.note };
    if (d.existingId) toUpdate.push({ id: d.existingId, ...row });
    else toInsert.push(row);
  });

  return { toDelete, toInsert, toUpdate };
}
