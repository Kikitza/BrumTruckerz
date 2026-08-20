// Čista logika telefonske prijave (BEZ Supabase importa — testabilno).
// Normalizacija u E.164 (+CCC…) i validacija; mapiranje GoTrue grešaka na i18n ključ.

export const DEFAULT_DIAL_PREFIX = "+381"; // podrazumevano Srbija; korisnik može promeniti

// Normalizuje uneti broj u E.164 („+" + cifre). `defaultPrefix` je pozivni broj zemlje
// (npr. „+381") koji se koristi kad korisnik unese NACIONALNI broj (sa vodećom 0 ili bez).
// Pravila (predvidljiva): +… → zadrži; 00… → +…; 0… → prefiks + ostatak (bez vodeće 0);
// inače → prefiks + broj.
export function normalizePhone(raw: string | null | undefined, defaultPrefix = DEFAULT_DIAL_PREFIX): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const hadPlus = s.startsWith("+");
  const digits = s.replace(/\D/g, ""); // samo cifre
  if (!digits) return "";
  const prefixDigits = defaultPrefix.replace(/\D/g, "");
  if (hadPlus) return "+" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+" + prefixDigits + digits.slice(1);
  return "+" + prefixDigits + digits;
}

// E.164: „+", prva cifra 1–9, ukupno 8–15 cifara.
export function isValidPhone(e164: string | null | undefined): boolean {
  return !!e164 && /^\+[1-9]\d{7,14}$/.test(e164);
}

// Ceo unos (prefiks + nacionalni broj) → E.164 (spoj kroz normalizePhone).
export function toE164(rawNumber: string, prefix = DEFAULT_DIAL_PREFIX): string {
  return normalizePhone(rawNumber, prefix);
}

// GoTrue greške OTP-a → i18n ključ (fallback: common.error). Čista fn → testabilno.
// NAPOMENA: GoTrue za POGREŠAN i za ISTEKAO kod vraća ISTU poruku („Token has expired
// or is invalid"), pa taj dvosmisleni slučaj mapiramo na jednu iskrenu poruku
// (otpInvalid pokriva i pogrešan i istekao); čist „expired" (bez „invalid") je redak.
export function phoneAuthErrorKey(message: string | null | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (!m) return "common.error";
  if (m.includes("rate") || m.includes("too many") || m.includes("after") || m.includes("429"))
    return "auth.err.otpTooMany";
  if (m.includes("expired") && !m.includes("invalid")) return "auth.err.otpExpired";
  if (m.includes("invalid") || m.includes("incorrect") || m.includes("token") || m.includes("expired"))
    return "auth.err.otpInvalid";
  return "common.error";
}
