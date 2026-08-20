// Podržane valute (jedan izvor istine — koriste ExpenseForm i čarobnjak nove firme).
// Predlog valute po zemlji „gde je očigledno", inače EUR.
export const CURRENCIES: string[] = [
  "EUR", "RSD", "PLN", "HUF", "CZK", "RON", "BGN", "CHF", "USD", "GBP", "TRY", "BAM", "MKD",
];

// Zemlja → valuta (samo one koje su u CURRENCIES; ostalo pada na EUR).
const BY_COUNTRY: Record<string, string> = {
  RS: "RSD", PL: "PLN", HU: "HUF", CZ: "CZK", RO: "RON", BG: "BGN",
  CH: "CHF", GB: "GBP", TR: "TRY", BA: "BAM", MK: "MKD", US: "USD",
};
// EU zemlje koje koriste EUR (eurozona) — predlog EUR.
const EUR_ZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT",
  "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "ME", "XK",
]);

export function suggestCurrency(countryCode?: string | null): string {
  const c = (countryCode ?? "").toUpperCase();
  if (BY_COUNTRY[c]) return BY_COUNTRY[c];
  if (EUR_ZONE.has(c)) return "EUR";
  return "EUR";
}
