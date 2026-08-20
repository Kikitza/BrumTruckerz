// Edge Function (Deno): CRON opomene za rokove.
// Skenira datumske rokove u prozoru (do 30 dana + istekli do 1 god), nalazi one koji
// su PRVI PUT dostigli prag {30,7,1,0} (ili prešli u hitniji), i šalje Expo Push
// VLASNICIMA firme. Upisuje notified_stage da se prag ne ponavlja.
//
// BEZBEDNOST:
//  * SERVICE ROLE ključ (bypass RLS) — samo ovde, server-side.
//  * Endpoint NIJE javno okidiv: zahteva tajni header `x-cron-secret` == env CRON_SECRET.
//    (Deploy sa `--no-verify-jwt`; zaštita je tajni header, ne JWT.)
//
// JEZIK PORUKE: srpski (sr). Obrazloženje: primarno tržište i vlasnici su srpski;
// jezik-po-korisniku je kasnija opcija (locale u app_users/push_tokens).
//
// Logika pragova je preslikana iz src/features/notifications/stage.ts (isti algoritam,
// drugi runtime; kanonska + testirana verzija je u src-u).
import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");

// prag: najhitniji (najmanji) dostignut {30,7,1,0}, ili null ako je dalje od 30 dana.
function applicableStage(days: number): number | null {
  if (days <= 0) return 0;
  if (days <= 1) return 1;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  return null;
}

// Km-prag (servis po km): 0 (prekoračeno) / 500 / 2000 / null. Paritet sa src/features/reminders/status.ts.
function applicableKmStage(remaining: number): number | null {
  if (remaining <= 0) return 0;
  if (remaining <= 500) return 500;
  if (remaining <= 2000) return 2000;
  return null;
}

// Srpski nazivi kategorija (custom -> label reda; + tipovi iz šifarnika 0024).
const CAT: Record<string, string> = {
  registration: "Registracija", technical: "Tehnički pregled", tacho_calibration: "Tahograf (kalibracija)",
  fire_extinguisher: "PP aparat", license_excerpt: "Izvod licence", cemt: "CEMT", code95: "Kôd 95",
  medical: "Lekarsko uverenje", adr: "ADR", green_card: "Zelena karta", tacho_card: "Tahograf kartica",
  contract: "Ugovor", service: "Servis", custom: "Rok",
  cpc: "CPC (Kôd 95)", adr_driver: "ADR sertifikat", adr_vehicle: "ADR vozila",
  vignette: "Vinjeta", trailer_technical: "Tehnički pregled", trailer_registration: "Registracija",
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const today = ymd(now);
  const horizon = ymd(new Date(now.getTime() + 30 * 864e5));
  const floor = ymd(new Date(now.getTime() - 365 * 864e5));
  const daysUntil = (d: string) =>
    Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 864e5);

  // Datumski rokovi u prozoru (uklj. istekle unazad godinu dana).
  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("id, company_id, subject_type, subject_id, category, label, due_date, notified_stage")
    .eq("kind", "date")
    .not("due_date", "is", null)
    .gte("due_date", floor)
    .lte("due_date", horizon);
  if (error) return new Response(error.message, { status: 500 });

  const due = (reminders ?? [])
    .map((r) => ({ r, days: daysUntil(r.due_date as string), stage: applicableStage(daysUntil(r.due_date as string)) }))
    .filter((x) => x.stage !== null && (x.r.notified_stage == null || (x.stage as number) < x.r.notified_stage));

  // KM-rokovi (servis po km, mode='km'): prag iz preostale kilometraže (due_km - current_odometer).
  const { data: kmRem } = await supabase
    .from("reminders")
    .select("id, company_id, subject_type, subject_id, category, label, due_km, notified_stage")
    .eq("mode", "km").not("due_km", "is", null);
  const { data: vehOdo } = await supabase.from("vehicles").select("id, current_odometer");
  const odoMap = new Map<string, number>();
  (vehOdo ?? []).forEach((v: { id: string; current_odometer: number | null }) => odoMap.set(v.id, v.current_odometer ?? 0));
  const dueKm = (kmRem ?? [])
    .map((r) => { const remaining = (r.due_km as number) - (odoMap.get(r.subject_id) ?? 0); return { r, remaining, stage: applicableKmStage(remaining) }; })
    .filter((x) => x.stage !== null && (x.r.notified_stage == null || (x.stage as number) < x.r.notified_stage));

  if (due.length === 0 && dueKm.length === 0) return Response.json({ scanned: (reminders?.length ?? 0) + (kmRem?.length ?? 0), due: 0, sent: 0 });

  // Imena subjekata (polimorfno, bez FK join-a).
  const [veh, tra, dri] = await Promise.all([
    supabase.from("vehicles").select("id, registration"),
    supabase.from("trailers").select("id, registration"),
    supabase.from("drivers").select("id, full_name"),
  ]);
  const names = new Map<string, string>();
  (veh.data ?? []).forEach((v: { id: string; registration: string }) => names.set(v.id, v.registration));
  (tra.data ?? []).forEach((t: { id: string; registration: string }) => names.set(t.id, t.registration));
  (dri.data ?? []).forEach((d: { id: string; full_name: string }) => names.set(d.id, d.full_name));

  // Vlasnici firmi iz dospelih rokova (datum + km) + njihovi tokeni.
  const companyIds = [...new Set([...due, ...dueKm].map((x) => x.r.company_id))];
  const { data: owners } = await supabase
    .from("app_users").select("id, company_id").eq("role", "owner").in("company_id", companyIds);
  const ownersByCompany = new Map<string, string[]>();
  (owners ?? []).forEach((o: { id: string; company_id: string }) => {
    const a = ownersByCompany.get(o.company_id) ?? [];
    a.push(o.id);
    ownersByCompany.set(o.company_id, a);
  });
  const ownerIds = (owners ?? []).map((o: { id: string }) => o.id);

  const tokensByUser = new Map<string, string[]>();
  if (ownerIds.length) {
    const { data: tokens } = await supabase.from("push_tokens").select("user_id, token").in("user_id", ownerIds);
    (tokens ?? []).forEach((t: { user_id: string; token: string }) => {
      const a = tokensByUser.get(t.user_id) ?? [];
      a.push(t.token);
      tokensByUser.set(t.user_id, a);
    });
  }

  // Sastavi Expo push poruke.
  const messages: { to: string; title: string; body: string; data: { screen: string } }[] = [];
  for (const x of due) {
    const subject = names.get(x.r.subject_id) ?? "—";
    const cat = x.r.category === "custom" ? (x.r.label?.trim() || CAT.custom) : (CAT[x.r.category] ?? x.r.category);
    const body = x.days < 0
      ? `${subject} — ${cat} je istekao`
      : x.days === 0
        ? `${subject} — ${cat} ističe danas`
        : `${subject} — ${cat} ističe za ${x.days} ${x.days === 1 ? "dan" : "dana"}`;
    const toks = (ownersByCompany.get(x.r.company_id) ?? []).flatMap((uid) => tokensByUser.get(uid) ?? []);
    for (const to of toks) messages.push({ to, title: "Rok ističe", body, data: { screen: "reminders" } });
  }
  // Km-rokovi: ista poruka, „još X km" (ili „prekoračeno za X km").
  for (const x of dueKm) {
    const subject = names.get(x.r.subject_id) ?? "—";
    const cat = x.r.category === "custom" ? (x.r.label?.trim() || CAT.custom) : (CAT[x.r.category] ?? x.r.category);
    const body = x.remaining < 0
      ? `${subject} — ${cat}: prekoračeno za ${Math.abs(x.remaining)} km`
      : `${subject} — ${cat}: još ${x.remaining} km`;
    const toks = (ownersByCompany.get(x.r.company_id) ?? []).flatMap((uid) => tokensByUser.get(uid) ?? []);
    for (const to of toks) messages.push({ to, title: "Servis vozila", body, data: { screen: "reminders" } });
  }

  let sent = 0;
  if (messages.length) {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return new Response(`push failed: ${await res.text()}`, { status: 502 });
    sent = messages.length;
  }

  // Upiši prag (i kad vlasnik nema token: prag je obrađen; alarm je vidljiv u aplikaciji).
  for (const x of [...due, ...dueKm]) {
    await supabase.from("reminders").update({ notified_stage: x.stage }).eq("id", x.r.id);
  }

  return Response.json({ scanned: (reminders?.length ?? 0) + (kmRem?.length ?? 0), due: due.length + dueKm.length, sent });
});
