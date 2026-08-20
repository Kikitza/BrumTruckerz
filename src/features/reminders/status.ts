// Čista logika statusa rokova (BEZ Supabase — testabilno): km-semafor, datumski semafor,
// „najgori od" (zajednički bedž subjekta) i predlog datuma iz intervala.

export type Severity = "ok" | "yellow" | "red";
export const SEVERITY_RANK: Record<Severity, number> = { red: 0, yellow: 1, ok: 2 };

// Preostalo km do servisa (može biti negativno = prekoračeno). null ako nema podataka.
export function kmRemaining(currentOdometer: number | null, dueKm: number | null): number | null {
  if (dueKm == null || currentOdometer == null) return null;
  return dueKm - currentOdometer;
}

// Km-semafor: crveno ≤500 km (uklj. prekoračeno), žuto ≤2000 km, inače zeleno. null ako nema podataka.
export function kmStatus(currentOdometer: number | null, dueKm: number | null): Severity | null {
  const rem = kmRemaining(currentOdometer, dueKm);
  if (rem == null) return null;
  if (rem <= 500) return "red";
  if (rem <= 2000) return "yellow";
  return "ok";
}

// Datumski semafor: isteklo (<0) crveno, ≤30 dana žuto, inače zeleno.
export function dateSeverity(daysUntil: number): Severity {
  if (daysUntil < 0) return "red";
  if (daysUntil <= 30) return "yellow";
  return "ok";
}

// Zajednički bedž subjekta = NAJGORI od svih statusa (crveno > žuto > zeleno). Prazno → 'ok'.
export function worstSeverity(list: (Severity | null | undefined)[]): Severity {
  let worst: Severity = "ok";
  for (const s of list) {
    if (!s) continue;
    if (SEVERITY_RANK[s] < SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}

// Predlog narednog datuma iz intervala (meseci). from = 'YYYY-MM-DD'. null meseci → null.
export function proposeDateFromInterval(fromYmd: string, months: number | null | undefined): string | null {
  if (months == null) return null;
  const d = new Date(`${fromYmd}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Cron-parity: km „prag" (najhitniji dostignut) — 0 (prekoračeno) / 500 / 2000 / null.
// Manji prag = hitniji (kao datumski {30,7,1,0}); šalje se kad je novi prag hitniji od zapisanog.
export function applicableKmStage(remaining: number): number | null {
  if (remaining <= 0) return 0;
  if (remaining <= 500) return 500;
  if (remaining <= 2000) return 2000;
  return null;
}
