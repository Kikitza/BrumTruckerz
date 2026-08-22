// Edge Function (Deno): OUTBOX WORKER — asinhrona obrada domenskih evenata (ADR 0012 §5b).
// Uzima batch neobrađenih evenata, pusti ih kroz HANDLER registar, markira processed
// (uspeh) ili error (pad), pa počisti stare obrađene (retencija). Poslednja karika
// event/outbox sloja: „primi" (trigeri, sinhrono) je razdvojeno od „obradi" (ovde, async).
//
// BEZBEDNOST (isti obrazac kao reminders-cron):
//  * SERVICE ROLE ključ (bypass RLS) — samo server-side.
//  * Endpoint NIJE javno okidiv: zahteva tajni header `x-cron-secret` == env CRON_SECRET
//    (fail-closed: bez tajne → 401). Deploy sa `--no-verify-jwt`.
//
// CLAIM je bezbedan od paralelnog rada: RPC outbox_claim_batch radi FOR UPDATE SKIP
// LOCKED + attempts+1 (lease) ATOMIČNO → dva workera ne obrade isti red. Isporuka je
// at-least-once → handleri MORAJU biti idempotentni.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const BATCH = 50;
const MAX_ATTEMPTS = 5; // posle 5 pokušaja → dead-letter (preskočen, ne blokira ostale)
const PRUNE_DAYS = 30;

type OutboxEvent = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  company_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

// ── HANDLER REGISTAR ────────────────────────────────────────────────────────
// v1: MINIMALNO (log/no-op). Struktura je spremna da SUTRA npr. reminder.due →
// slanje push-a, invoice.paid → notifikacija, budu SAMO NOVI unos ovde — bez
// diranja petlje ispod. Nepoznat/neregistrovan tip → no-op (event je „primljen",
// nema šta da se radi) → svejedno se markira processed da se ne gomila.
//
// Handler koji baci grešku → red se NE markira processed → retry (do MAX), pa dead-letter.
type Handler = (e: OutboxEvent, admin: SupabaseClient) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  // Primer buduće nadogradnje (namerno zakomentarisano — v1 je no-op):
  //   "reminder.due":  async (e, admin) => { /* sastavi + pošalji push */ },
  //   "invoice.paid":  async (e, admin) => { /* obavesti vlasnika */ },
  //
  // Namenski test-handler: dozvoljava smoke-proveru dead-letter puta bez pravog posla.
  "test.boom": async () => {
    throw new Error("namerni pad handlera (smoke test dead-letter)");
  },
  "test.ok": async () => {
    /* no-op uspeh */
  },
};

async function runHandler(e: OutboxEvent, admin: SupabaseClient): Promise<void> {
  const h = HANDLERS[e.event_type];
  if (h) await h(e, admin); // registrovan → izvrši (može baciti → retry)
  // else: nema handlera → no-op uspeh (ništa se ne radi, event je isporučen kao „primljen")
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Claim batch (atomičan lease; paralelni workeri preskaču zaključane redove).
  const { data: claimed, error: claimErr } = await admin.rpc("outbox_claim_batch", {
    p_limit: BATCH,
    p_max_attempts: MAX_ATTEMPTS,
  });
  if (claimErr) return new Response(`claim failed: ${claimErr.message}`, { status: 500 });

  const batch = (claimed ?? []) as OutboxEvent[];
  let processed = 0;
  let failed = 0;

  // 2) Obradi svaki red NEZAVISNO (pad jednog ne ruši ostale — dead-letter semantika).
  for (const e of batch) {
    try {
      await runHandler(e, admin);
      await admin.rpc("outbox_mark_processed", { p_id: e.id });
      processed++;
    } catch (err) {
      await admin.rpc("outbox_mark_error", { p_id: e.id, p_error: String((err as Error)?.message ?? err) });
      failed++;
    }
  }

  // 3) Retencija: počisti obrađene starije od PRUNE_DAYS (audit_log ostaje trajno).
  const { data: pruned } = await admin.rpc("outbox_prune", { p_days: PRUNE_DAYS });

  return Response.json({ claimed: batch.length, processed, failed, pruned: pruned ?? 0 });
});
