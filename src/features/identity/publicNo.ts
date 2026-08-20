// Čista logika javnih brojeva (BEZ Supabase importa — testabilno).
// Autoritativni generator je u BAZI (sekvenca + format_public_no, migracija 0017);
// ovo je za prikaz/validaciju u klijentu i mora da se poklapa sa SQL formatom.

// 'BT-<PREFIX>-#####' (najmanje 5 cifara, nula-dopunjeno). Ogledalo SQL format_public_no.
export function formatPublicNo(prefix: string, n: number): string {
  return `BT-${prefix.toUpperCase()}-${String(n).padStart(5, "0")}`;
}

// Javni broj vozača: 'BT-D-#####'.
export function driverPublicNo(n: number): string {
  return formatPublicNo("D", n);
}

// Validacija formata vozačevog broja (5+ cifara, veliko 'D').
export function isValidDriverPublicNo(value: string | null | undefined): boolean {
  return !!value && /^BT-D-\d{5,}$/.test(value);
}
