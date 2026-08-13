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
