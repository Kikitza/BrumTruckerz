// Edge Function (Deno): OWNER briše app nalog vozača. Istorija (događaji, troškovi,
// prilozi) OSTAJE — brišu se samo nalog i veza. Autorizacija: samo owner (v. _shared/auth.ts).
//
// FK napomena: trip_events.created_by / expenses.created_by referišu app_users/auth.users
// bez ON DELETE (=RESTRICT), pa bi blokirali brisanje. Zato se created_by na tim redovima
// postavlja na NULL (audit-pokazivač) — SAMI REDOVI I NJIHOV SADRŽAJ OSTAJU netaknuti.
import { requireOwner, loadOwnDriver, json, errorResponse, HttpError } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  try {
    const ctx = await requireOwner(req);
    const { driver_id } = await req.json().catch(() => ({}));

    const driver = await loadOwnDriver(ctx, driver_id);
    if (!driver.user_id) throw new HttpError(409, "Vozač nema nalog");
    const uid = driver.user_id;

    // 1) Oslobodi FK RESTRICT: created_by -> null (redovi ostaju; menja se samo audit-pokazivač).
    const e1 = (await ctx.admin.from("trip_events").update({ created_by: null }).eq("created_by", uid)).error;
    if (e1) throw new HttpError(500, e1.message);
    const e2 = (await ctx.admin.from("expenses").update({ created_by: null }).eq("created_by", uid)).error;
    if (e2) throw new HttpError(500, e2.message);

    // 2) Skini vezu sa flote (drivers.user_id) — vozač kao entitet flote ostaje.
    const e3 = (await ctx.admin.from("drivers").update({ user_id: null }).eq("id", driver.id)).error;
    if (e3) throw new HttpError(500, e3.message);

    // 3) Obriši app_users red, pa auth korisnika (app_users kaskadno pada uz auth, ali eksplicitno).
    const e4 = (await ctx.admin.from("app_users").delete().eq("id", uid)).error;
    if (e4) throw new HttpError(500, e4.message);
    const { error: e5 } = await ctx.admin.auth.admin.deleteUser(uid);
    if (e5) throw new HttpError(500, e5.message);

    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
});
