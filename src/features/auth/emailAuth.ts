// Mapiranje GoTrue grešaka prijave imejlom → i18n ključ (auth.err.*). Čista fn (bez Supabase) → testabilno,
// analogno phoneAuthErrorKey. Poruka se prikazuje INLINE na ekranu prijave (crveni tekst), ne kroz Alert.
export function emailAuthErrorKey(message: string | null | undefined): string {
  const m = (message ?? "").toLowerCase();
  // Mrežna greška (fetch/timeout/offline) — javi svojom porukom, ne „pogrešna lozinka".
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("fetch") || m.includes("timeout"))
    return "auth.err.network";
  // Nalog nije potvrđen mejlom.
  if (m.includes("not confirmed") || m.includes("email not confirmed"))
    return "auth.err.emailNotConfirmed";
  // Pogrešan imejl/lozinka (GoTrue: „Invalid login credentials").
  if (m.includes("invalid login credentials") || m.includes("invalid credentials") || m.includes("invalid_credentials"))
    return "auth.err.invalidCredentials";
  // Nepoznato → iskrena generička poruka o neuspehu prijave.
  return "auth.err.signInFailed";
}
