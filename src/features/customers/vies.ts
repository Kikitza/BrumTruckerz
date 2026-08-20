// Čista logika VIES provere (BEZ Supabase/mreže — testabilno). Poziv servisa je u Edge
// funkciji `vies-check`; ovde su normalizacija PIB-a, EU pokrivenost i mapiranje ishoda.

// VIES (EU Komisija) pokriva SAMO EU članice (+ 'XI' za Severnu Irsku). Grčka je 'EL' u
// VIES-u (ne 'GR'). Srbija (RS) npr. NIJE u VIES-u.
export const VIES_COUNTRIES = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "XI",
];

// Korisnički unos zemlje → VIES kod: velika slova; GR je alias za EL.
export function viesCountryCode(cc: string | null | undefined): string {
  const c = (cc ?? "").trim().toUpperCase();
  return c === "GR" ? "EL" : c;
}

export function isEuVatCountry(cc: string | null | undefined): boolean {
  return VIES_COUNTRIES.includes(viesCountryCode(cc));
}

// Normalizuj PIB: velika slova, izbaci sve sem [A-Z0-9]; skini VODEĆI kod zemlje ako ga je
// korisnik ukucao (npr. "DE123..." uz country DE → "123..."; "EL"/"GR" alias za Grčku).
export function normalizeVat(raw: string | null | undefined, countryCode?: string | null): string {
  let v = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cc = viesCountryCode(countryCode);
  const rawCc = (countryCode ?? "").trim().toUpperCase();
  for (const p of [cc, rawCc].filter(Boolean)) {
    if (p.length === 2 && v.startsWith(p) && v.length > p.length) { v = v.slice(p.length); break; }
  }
  return v;
}

export type ViesStatus = "valid" | "invalid" | "unavailable" | "not_eu";

// Ishod → i18n ključ (poruka za korisnika).
export function viesMessageKey(status: ViesStatus): string {
  const map: Record<ViesStatus, string> = {
    valid: "customers.vies.valid",
    invalid: "customers.vies.invalid",
    unavailable: "customers.vies.unavailable",
    not_eu: "customers.vies.notEu",
  };
  return map[status];
}
