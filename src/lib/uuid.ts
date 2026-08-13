// UUID v4 (RFC4122) — klijentski generisan id za offline stavke (prilozi, trošak).
// Math.random je dovoljan za lokalne id-eve (nije bezbednosno osetljivo); bez native dep.
export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
