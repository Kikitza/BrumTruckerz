// Čiste funkcije karijernog profila (bez mreže) — agregacija km i formatiranje staža/perioda.
import type { CareerKmPoint } from "./api";

// Godina iz "YYYY-MM-DD" (year_month je 1. u mesecu). Bez new Date() radi determinizma/testova.
export const yearOf = (ym: string): number => Number(ym.slice(0, 4));
export const monthOf = (ym: string): number => Number(ym.slice(5, 7)); // 1..12

// Distinktne godine sa podacima, opadajuće (za prebacivač godina).
export function availableYears(series: CareerKmPoint[]): number[] {
  const set = new Set<number>();
  for (const p of series) if (p.total_km > 0 || p.trips_count > 0) set.add(yearOf(p.year_month));
  return [...set].sort((a, b) => b - a);
}

// 12 vrednosti km (index 0 = januar) za datu godinu; meseci bez podataka = 0.
export function kmByMonthForYear(series: CareerKmPoint[], year: number): number[] {
  const out = new Array(12).fill(0);
  for (const p of series) {
    if (yearOf(p.year_month) !== year) continue;
    const m = monthOf(p.year_month);
    if (m >= 1 && m <= 12) out[m - 1] += p.total_km;
  }
  return out;
}

// Staž iz broja dana → { godine, meseci } (30.44 dana/mesec, dovoljno za prikaz).
export function tenureYearsMonths(days: number): { years: number; months: number } {
  const d = Math.max(0, Math.floor(days));
  const totalMonths = Math.floor(d / 30.44);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

// "YYYY-MM-DD" → "MM.YYYY" (period zaposlenja). Prazno → "".
export function monthYear(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return `${dateStr.slice(5, 7)}.${dateStr.slice(0, 4)}`;
}
