// Edge Function (Deno): OWNER čita email naloga vozača (auth.users nije čitljiv iz klijenta).
// Koristi UI „Flota → vozač" da prikaže email za vozača koji IMA nalog. Samo owner svoje firme.
import { requireOwner, loadOwnDriver, json, errorResponse, HttpError } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  try {
    const ctx = await requireOwner(req);
    const { driver_id } = await req.json().catch(() => ({}));

    const driver = await loadOwnDriver(ctx, driver_id);
    if (!driver.user_id) return json({ email: null });

    const { data, error } = await ctx.admin.auth.admin.getUserById(driver.user_id);
    if (error) throw new HttpError(500, error.message);
    return json({ email: data.user?.email ?? null });
  } catch (e) {
    return errorResponse(e);
  }
});
