import { availableYears, kmByMonthForYear, tenureYearsMonths, monthYear, yearOf, monthOf } from "./calc";
import type { CareerKmPoint } from "./api";

const p = (ym: string, km: number, trips = 1): CareerKmPoint => ({ year_month: ym, total_km: km, trips_count: trips });

describe("career/calc", () => {
  it("yearOf/monthOf parsiraju year_month", () => {
    expect(yearOf("2026-03-01")).toBe(2026);
    expect(monthOf("2026-03-01")).toBe(3);
  });

  it("availableYears: distinktne godine, opadajuće, samo sa podacima", () => {
    const s = [p("2025-01-01", 100), p("2026-05-01", 200), p("2026-06-01", 0, 0), p("2024-12-01", 0, 0)];
    expect(availableYears(s)).toEqual([2026, 2025]); // 2026-06 (0 km/0 tura) i 2024 (0/0) se izostavljaju
  });

  it("kmByMonthForYear: 12 meseci, sabira po mesecu, ostalo 0", () => {
    const s = [p("2026-01-01", 100), p("2026-01-01", 50), p("2026-03-01", 300), p("2025-01-01", 999)];
    const out = kmByMonthForYear(s, 2026);
    expect(out).toHaveLength(12);
    expect(out[0]).toBe(150); // januar 100+50
    expect(out[2]).toBe(300); // mart
    expect(out[1]).toBe(0);   // februar
    expect(out.reduce((a, b) => a + b, 0)).toBe(450); // 2025 se ne broji
  });

  it("tenureYearsMonths: dani → godine/meseci", () => {
    expect(tenureYearsMonths(0)).toEqual({ years: 0, months: 0 });
    expect(tenureYearsMonths(400)).toEqual({ years: 1, months: 1 }); // ~13.1 meseci
    expect(tenureYearsMonths(-5)).toEqual({ years: 0, months: 0 });
  });

  it("monthYear: YYYY-MM-DD → MM.YYYY; prazno → ''", () => {
    expect(monthYear("2026-03-15")).toBe("03.2026");
    expect(monthYear(null)).toBe("");
    expect(monthYear(undefined)).toBe("");
  });
});
