// Edge Function (Deno): CRON za rokove — pokreće se rasporedom (Supabase Scheduled Functions).
// Skenira SAMO prozor (ne celu bazu): datumske rokove koji ističu u narednih 30 dana
// i kilometražne kojima se vozilo približilo. Šalje Expo push preko push_tokens.
// SERVICE ROLE ključ: samo ovde (server), nikad u klijentu.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KM_WARN = 2000; // javi kad je vozilo na <2000 km od servisa

Deno.serve(async () => {
  // 1) datumski rokovi u prozoru od 30 dana
  const { data: dateDue, error: e1 } = await supabase
    .from("reminders")
    .select("id, company_id, subject_type, subject_id, category, due_date")
    .eq("kind", "date")
    .gte("due_date", new Date().toISOString().slice(0, 10))
    .lte("due_date", new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  if (e1) return new Response(e1.message, { status: 500 });

  // 2) kilometražni: due_odometer - current_odometer <= KM_WARN
  const { data: kmDue, error: e2 } = await supabase.rpc("noop"); // TODO korak 7:
  // napraviti SQL view/rpc "mileage_reminders_due(km_warn)" koji join-uje reminders(kind=mileage)
  // sa vehicles.current_odometer i vraća dospele — pa ga ovde pozvati umesto noop.
  void e2; void kmDue;

  // 3) push vlasnicima firmi (owner) preko Expo Push API
  //    - nađi owner user_id-eve po company_id iz dospelih
  //    - uzmi tokene iz push_tokens
  //    - POST https://exp.host/--/api/v2/push/send  [{ to, title, body }]
  // TODO korak 7 (v. CLAUDE.md) — namerno skica: prvo definisati format poruke po kategoriji.

  return Response.json({ dateDueCount: dateDue?.length ?? 0 });
});
