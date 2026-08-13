// Parsiranje brojeva iz korisničkog unosa (podržava zarez kao decimalni separator).
// Deljeno (pravilo KVALITET KODA #1: bez dupliranja). Prazno / nevalidno -> null.
export const toNum = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export const toInt = (s: string): number | null => {
  const n = toNum(s);
  return n == null ? null : Math.round(n);
};
