// Edge Function (Deno): KANCELARIJA (owner/dispečer) pravi app nalog za POSTOJEĆEG vozača flote (bez user_id).
// Autorizacija: prijavljen owner ili dispečer (v. _shared/auth.ts). Service role unutra.
// NIKAD ne pravi novi `drivers` red — samo auth user + app_users + UPDATE drivers.user_id
// (lekcija o „blizancima": jedan vozač = jedan drivers red).
import { requireOffice, loadOwnDriver, json, errorResponse, HttpError } from "../_shared/auth.ts";

function genPassword(): string {
  // 12 znakova iz sigurnog alfabeta (bez sličnih: 0/O, 1/l/I).
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

Deno.serve(async (req) => {
  try {
    const ctx = await requireOffice(req);
    const { driver_id, email, password } = await req.json().catch(() => ({}));

    const mail = String(email ?? "").trim().toLowerCase();
    if (!mail || !mail.includes("@")) throw new HttpError(400, "Ispravan email je obavezan");

    const driver = await loadOwnDriver(ctx, driver_id);
    if (driver.user_id) throw new HttpError(409, "Vozač već ima nalog"); // idempotentno: ne pravimo drugi

    const pass = password && String(password).length >= 6 ? String(password) : genPassword();

    // 1) auth user (email potvrđen — vozač se odmah prijavljuje)
    const { data: created, error: cErr } = await ctx.admin.auth.admin.createUser({
      email: mail, password: pass, email_confirm: true,
    });
    if (cErr || !created?.user) {
      const dup = /already|registered|exists/i.test(cErr?.message ?? "");
      throw new HttpError(dup ? 409 : 400, dup ? "Email je već zauzet" : (cErr?.message ?? "Neuspešno kreiranje naloga"));
    }
    const newUid = created.user.id;

    // 2) app_users (role driver, firma POZIVAOCA). Na grešku — vrati auth user (bez siročeta).
    const { error: auErr } = await ctx.admin.from("app_users").insert({
      id: newUid, company_id: ctx.companyId, role: "driver", full_name: driver.full_name,
    });
    if (auErr) {
      await ctx.admin.auth.admin.deleteUser(newUid);
      throw new HttpError(500, auErr.message);
    }

    // 3) UPDATE postojećeg drivers reda (nikad insert). Na grešku — očisti app_users + auth user.
    const { error: upErr } = await ctx.admin.from("drivers").update({ user_id: newUid }).eq("id", driver.id);
    if (upErr) {
      await ctx.admin.from("app_users").delete().eq("id", newUid);
      await ctx.admin.auth.admin.deleteUser(newUid);
      throw new HttpError(500, upErr.message);
    }

    return json({ email: mail, password: pass, user_id: newUid });
  } catch (e) {
    return errorResponse(e);
  }
});
