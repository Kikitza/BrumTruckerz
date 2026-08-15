// Čiste funkcije za admin prikaz (BEZ Supabase importa — testabilno).

// paid_until je prošao (crveno) — striktno pre današnjeg datuma.
export function isPastDue(paidUntil: string | null | undefined, todayYMD: string): boolean {
  return !!paidUntil && paidUntil < todayYMD;
}

// Stanje iskorišćenosti limita vozila za bedž.
export type LimitState = "ok" | "at" | "over";
export function limitState(used: number, limit: number): LimitState {
  if (used > limit) return "over";
  if (used >= limit) return "at";
  return "ok";
}

// Ukupne brojke platforme iz liste firmi (header).
export type CompanyCounts = { vehicles_used: number; drivers_used: number };
export function platformTotals(rows: CompanyCounts[]): { companies: number; vehicles: number; drivers: number } {
  return {
    companies: rows.length,
    vehicles: rows.reduce((s, r) => s + (r.vehicles_used ?? 0), 0),
    drivers: rows.reduce((s, r) => s + (r.drivers_used ?? 0), 0),
  };
}
