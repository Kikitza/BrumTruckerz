// Kursevi (pravilo #4). Izvor: ECB preko frankfurter.app (besplatno, bez ključa).
// Zamenjivo iza ovog interfejsa; ručna korekcija uvek moguća (fx_rate u payload-u).
export async function getRate(
  from: string,
  to: string,
  dateISO: string, // YYYY-MM-DD (kurs za DATUM troška, ne za danas)
): Promise<number | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/${dateISO}?from=${from}&to=${to}`);
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data?.rates?.[to];
    return typeof rate === "number" ? rate : null;
  } catch {
    return null; // handler baca grešku -> mutacija ostaje u redu, pokušaće ponovo
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Rezultat FX obračuna troška (pravila #4/#5): matematiku računa KOD, nikad model.
export type BaseComputation = { fx_rate: number; fx_rate_date: string; base_amount: number };

// Zajednička FX matematika za troškove — koristi je i owner ONLINE putanja
// (features/expenses/api.ts) i offline handler (lib/offline/handlers.ts).
// kurs: ručni override -> 1 ako su valute iste -> getRate za DATUM troška.
// Baca ako kursa nema (online: prijavi korisniku; offline: mutacija ostaje u redu).
export async function computeBase(
  original: number,
  from: string,
  to: string,
  date: string, // YYYY-MM-DD (datum troška)
  fxOverride?: number,
): Promise<BaseComputation> {
  const rate = fxOverride ?? (from === to ? 1 : await getRate(from, to, date));
  if (rate == null) throw new Error(`Nema kursa ${from}->${to} za ${date}`);
  return { fx_rate: rate, fx_rate_date: date, base_amount: round2(original * rate) };
}
