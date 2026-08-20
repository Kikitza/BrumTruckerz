// Edge Function (Deno): VIES provera PIB-a (EU Komisija) za naručioca.
// Autorizacija: prijavljen owner ili dispečer (requireOffice). BEZ tajni — VIES je javan.
// Ulaz: { country_code, vat_number, customer_id? }. Vraća { status, name, address }.
//   status: 'valid' | 'invalid' | 'unavailable'  (klijent zna 'not_eu' pre poziva).
// Ako je customer_id dat i naručilac je iz firme pozivaoca → upiši ishod (osim 'unavailable').
// Mrežna/servisna greška → 'unavailable' (ne ruši).
import { requireOffice, loadOwnCustomer, json, errorResponse, HttpError } from "../_shared/auth.ts";

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
// Kodovi VIES greške koji znače „servis trenutno nedostupan" (ne = nevalidan PIB).
const UNAVAILABLE = new Set([
  "MS_UNAVAILABLE", "MS_MAX_CONCURRENT_REQ", "GLOBAL_MAX_CONCURRENT_REQ",
  "SERVICE_UNAVAILABLE", "TIMEOUT", "IP_BLOCKED",
]);

function normCountry(cc: string): string {
  const c = (cc ?? "").trim().toUpperCase();
  return c === "GR" ? "EL" : c;
}
function normVat(raw: string, cc: string): string {
  let v = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const p of [normCountry(cc), (cc ?? "").trim().toUpperCase()]) {
    if (p.length === 2 && v.startsWith(p) && v.length > p.length) { v = v.slice(p.length); break; }
  }
  return v;
}
const clean = (s: unknown): string | null => (typeof s === "string" && s && s !== "---" ? s : null);

type Outcome = { status: "valid" | "invalid" | "unavailable"; name: string | null; address: string | null };

async function callVies(countryCode: string, vatNumber: string): Promise<Outcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(VIES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: "unavailable", name: null, address: null };
    const data = await res.json();

    // Servisna greška (npr. non-EU → INVALID_INPUT; ili MS_UNAVAILABLE).
    const errCode = data?.errorWrappers?.[0]?.error as string | undefined;
    if (data?.actionSucceed === false || errCode) {
      if (errCode && UNAVAILABLE.has(errCode)) return { status: "unavailable", name: null, address: null };
      return { status: "invalid", name: null, address: null }; // INVALID_INPUT i sl. = nije pronađen
    }

    if (data?.valid === true) return { status: "valid", name: clean(data.name), address: clean(data.address) };
    if (data?.valid === false) return { status: "invalid", name: null, address: null };
    return { status: "unavailable", name: null, address: null };
  } catch {
    return { status: "unavailable", name: null, address: null }; // mreža/timeout
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  try {
    const ctx = await requireOffice(req);
    const body = await req.json().catch(() => ({}));
    const countryCode = normCountry(String(body.country_code ?? ""));
    const vatNumber = normVat(String(body.vat_number ?? ""), String(body.country_code ?? ""));
    const customerId = body.customer_id ? String(body.customer_id) : null;

    if (countryCode.length !== 2 || !vatNumber) throw new HttpError(400, "country_code i vat_number su obavezni");

    const out = await callVies(countryCode, vatNumber);

    // Upis ishoda na naručioca (samo ako je dat i iz firme pozivaoca; ne upisuj 'unavailable').
    let checkedAt: string | null = null;
    if (customerId && out.status !== "unavailable") {
      await loadOwnCustomer(ctx, customerId); // 403 ako nije iz firme
      checkedAt = new Date().toISOString();
      const { error } = await ctx.admin.from("customers").update({
        vies_valid: out.status === "valid",
        vies_name: out.status === "valid" ? out.name : null,
        vies_checked_at: checkedAt,
      }).eq("id", customerId);
      if (error) throw new HttpError(500, error.message);
    }

    return json({ status: out.status, name: out.name, address: out.address, checked_at: checkedAt });
  } catch (e) {
    return errorResponse(e);
  }
});
