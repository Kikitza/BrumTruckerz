// Deljena autorizacija za driver-account funkcije: dozvoli prijavljenu KANCELARIJU
// (owner ILI dispatcher) — po matrici ADR 0003 dispečer upravlja nalozima vozača.
// Identitet pozivaoca iz njegovog JWT-a (Authorization) → app_users.role/company.
// Vraća admin (service-role) klijenta + company_id pozivaoca. Bez dupliranja po funkciji.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type OfficeCtx = { admin: SupabaseClient; uid: string; companyId: string };

// Dozvoli SAMO prijavljenu kancelariju (owner ili dispatcher) SVOJE firme.
export async function requireOffice(req: Request): Promise<OfficeCtx> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  // Identitet pozivaoca (anon ključ NEMA user-a → getUser vraća null → 401).
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await asUser.auth.getUser();
  if (error || !user) throw new HttpError(401, "Neautorizovano");

  const admin = createClient(url, serviceKey);
  const { data: profile, error: pErr } = await admin
    .from("app_users").select("role, company_id").eq("id", user.id).single();
  if (pErr || !profile) throw new HttpError(403, "Nalog nije povezan sa firmom");
  if (profile.role !== "owner" && profile.role !== "dispatcher") {
    throw new HttpError(403, "Samo vlasnik ili dispečer može da upravlja nalozima vozača");
  }
  if (!profile.company_id) throw new HttpError(403, "Nalog nije vezan za firmu");

  return { admin, uid: user.id, companyId: profile.company_id as string };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  return json({ error: e instanceof Error ? e.message : "Greška" }, 500);
}

// Učitaj vozača i potvrdi da pripada firmi POZIVAOCA (403 ako ne).
export async function loadOwnDriver(ctx: OfficeCtx, driverId: string) {
  if (!driverId) throw new HttpError(400, "driver_id je obavezan");
  const { data: driver, error } = await ctx.admin
    .from("drivers").select("id, company_id, user_id, full_name").eq("id", driverId).single();
  if (error || !driver) throw new HttpError(404, "Vozač ne postoji");
  if (driver.company_id !== ctx.companyId) throw new HttpError(403, "Vozač nije iz vaše firme");
  return driver as { id: string; company_id: string; user_id: string | null; full_name: string };
}

// Učitaj naručioca i potvrdi da pripada firmi POZIVAOCA (403 ako ne).
export async function loadOwnCustomer(ctx: OfficeCtx, customerId: string) {
  if (!customerId) throw new HttpError(400, "customer_id je obavezan");
  const { data: c, error } = await ctx.admin
    .from("customers").select("id, company_id, name, country_code, vat_number").eq("id", customerId).single();
  if (error || !c) throw new HttpError(404, "Naručilac ne postoji");
  if (c.company_id !== ctx.companyId) throw new HttpError(403, "Naručilac nije iz vaše firme");
  return c as { id: string; company_id: string; name: string; country_code: string | null; vat_number: string | null };
}
