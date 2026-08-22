// Čista logika koda pozivnice (BEZ Supabase importa — testabilno).
// Autoritativni generator + provera su u BAZI (0018: gen_invite_code + partial-unique);
// ovde je prikaz/validacija/istek u klijentu i mora da se poklapa sa SQL pravilima.

// Alfabet BEZ zabunljivih znakova O/0/I/1 (ogledalo SQL gen_invite_code).
export const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const INVITE_CODE_LENGTH = 8;

export type InviteStatus = "pending" | "accepted" | "cancelled" | "expired";

// Normalizacija unosa: velika slova, izbaci sve što nije iz [0-9A-Z] (razmaci, crtice).
export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// Ispravan kod = tačno 8 znakova, svi iz dozvoljenog alfabeta (posle normalizacije).
export function isValidInviteCode(raw: string | null | undefined): boolean {
  const c = normalizeInviteCode(raw);
  if (c.length !== INVITE_CODE_LENGTH) return false;
  return [...c].every((ch) => INVITE_ALPHABET.includes(ch));
}

// Da li je pozivnica istekla u datom trenutku (`now` se prosleđuje → deterministično).
export function isInviteExpired(expiresAt: string | Date, now: Date): boolean {
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return exp.getTime() <= now.getTime();
}

// Efektivni status za PRIKAZ: pending kome je istekao rok se prikazuje kao „expired"
// (baza to lenjo obeleži tek pri pokušaju prihvatanja). Ostali statusi ostaju kakvi jesu.
export function effectiveInviteStatus(status: InviteStatus, expiresAt: string, now: Date): InviteStatus {
  if (status === "pending" && isInviteExpired(expiresAt, now)) return "expired";
  return status;
}

// RPC accept_invitation baca greške sa kratkim KODOM u poruci. Mapiramo na i18n ključ
// (fallback: common.error). Čista fn → testabilno; UI samo prosledi t(key).
export function inviteErrorKey(message: string | null | undefined): string {
  const m = (message ?? "").toUpperCase();
  if (m.includes("INVITE_NOT_FOUND")) return "invite.err.notFound";
  if (m.includes("INVITE_EXPIRED")) return "invite.err.expired";
  if (m.includes("INVITE_CANCELLED")) return "invite.err.cancelled";
  if (m.includes("INVITE_USED")) return "invite.err.used";
  if (m.includes("INVITE_OTHER_COMPANY")) return "invite.err.otherCompany";
  if (m.includes("INVITE_COMPANY_SUSPENDED")) return "invite.err.suspended";
  if (m.includes("INVITE_DISPATCHER_NOT_READY")) return "invite.err.dispatcherNotReady";
  if (m.includes("INVITE_ROLE_CANNOT_ACCEPT")) return "invite.err.roleCannotAccept";
  if (m.includes("INVITE_DRIVER_ALREADY_ENGAGED")) return "invite.err.driverAlreadyEngaged";
  return "common.error";
}
