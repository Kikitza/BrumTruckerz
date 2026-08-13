// Edge Function (Deno): potpisani (presigned) URL-ovi za Cloudflare R2 — JEDNA funkcija, dve akcije.
//
// BEZBEDNOST:
//  - Zahteva važeći korisnički JWT (Authorization: Bearer ...).
//  - Supabase klijent se pravi SA POZIVAOČEVIM tokenom => svi select-i prolaze kroz RLS.
//    Pravo pristupa NE proverava ova funkcija ručno, već baza: ako RLS ne vrati red -> 403.
//  - R2 tajne isključivo iz env-a (Supabase Edge Secrets): R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
//    R2_SECRET_ACCESS_KEY / R2_BUCKET. Nijedan ključ nije u kodu/repou.
//  - storage_key generiše SERVER (company_id/trip_id/uuid.jpg) — nikad se ne veruje klijentu.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  region: "auto",
  service: "s3",
});
const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;

const UPLOAD_TTL = 900; // 15 min
const DOWNLOAD_TTL = 600; // 10 min

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

// Presign preko query parametara (X-Amz-*). Vraća potpisani URL kao string.
async function presign(key: string, method: "PUT" | "GET", ttl: number): Promise<string> {
  const u = new URL(`${endpoint}/${key}`);
  u.searchParams.set("X-Amz-Expires", String(ttl));
  const signed = await r2.sign(u.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "no token" }, 401);

  // Klijent SA korisničkim tokenom -> RLS važi za svaki upit.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let body: { action?: string; kind?: string; trip_id?: string; expense_id?: string; storage_key?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  // ── UPLOAD: proveri ciljni red kroz RLS, generiši ključ, vrati presigned PUT ──
  if (body.action === "upload") {
    let company_id: string | null = null;
    let trip_id: string | null = null;

    if (body.expense_id) {
      const { data } = await supabase
        .from("expenses").select("id, company_id, trip_id").eq("id", body.expense_id).maybeSingle();
      if (!data) return json({ error: "forbidden" }, 403); // RLS nije vratio red
      company_id = data.company_id;
      trip_id = data.trip_id;
    } else if (body.trip_id) {
      // C2 (Dokumenti na turi): vlasnik čita trips; vozač ide preko driver_trips view-a.
      const { data } = await supabase
        .from("trips").select("id, company_id").eq("id", body.trip_id).maybeSingle();
      if (!data) return json({ error: "forbidden" }, 403);
      company_id = data.company_id;
      trip_id = data.id;
    } else {
      return json({ error: "expense_id or trip_id required" }, 400);
    }

    const key = `${company_id}/${trip_id}/${crypto.randomUUID()}.jpg`;
    const url = await presign(key, "PUT", UPLOAD_TTL);
    return json({ url, storage_key: key, company_id, trip_id });
  }

  // ── DOWNLOAD: prilog mora biti vidljiv pozivaocu (RLS), pa vrati presigned GET ──
  if (body.action === "download") {
    if (!body.storage_key) return json({ error: "storage_key required" }, 400);
    const { data } = await supabase
      .from("attachments").select("id").eq("storage_key", body.storage_key).maybeSingle();
    if (!data) return json({ error: "forbidden" }, 403);
    const url = await presign(body.storage_key, "GET", DOWNLOAD_TTL);
    return json({ url });
  }

  return json({ error: "unknown action" }, 400);
});
