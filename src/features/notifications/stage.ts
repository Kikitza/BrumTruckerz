// Čista logika pragova opomena (BEZ zavisnosti — testabilno). Kanonska verzija;
// Edge funkcija reminders-cron preslikava isto (Deno runtime, bez importa iz src-a).
//
// Pragovi: {30, 7, 1, 0} dana do isteka. `applicableStage(days)` vraća NAJHITNIJI
// (najmanji) prag koji je dostignut, ili null ako je rok dalje od 30 dana.
// Istekli rokovi (days < 0) padaju u prag 0 ("ističe za 0 dana / je istekao").
export const STAGES = [30, 7, 1, 0] as const;

export function applicableStage(days: number): number | null {
  if (days <= 0) return 0;
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  return null;
}

// Šalji samo kad je dostignuti prag hitniji (manji) od već poslatog — ili nije poslato.
// Tako se svaki prag pošalje jednom, a ulazak u hitniji prag ponovo obavesti.
export function shouldNotify(days: number, notifiedStage: number | null): boolean {
  const s = applicableStage(days);
  if (s === null) return false;
  return notifiedStage == null || s < notifiedStage;
}
