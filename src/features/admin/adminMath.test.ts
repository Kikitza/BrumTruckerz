import { isPastDue, limitState, platformTotals } from "./adminMath";

describe("isPastDue", () => {
  it("true kad je paid_until pre danas", () => {
    expect(isPastDue("2026-08-01", "2026-08-15")).toBe(true);
  });
  it("false kad je danas ili u budućnosti / null", () => {
    expect(isPastDue("2026-08-15", "2026-08-15")).toBe(false);
    expect(isPastDue("2026-09-01", "2026-08-15")).toBe(false);
    expect(isPastDue(null, "2026-08-15")).toBe(false);
    expect(isPastDue(undefined, "2026-08-15")).toBe(false);
  });
});

describe("limitState", () => {
  it("ok / at / over", () => {
    expect(limitState(3, 5)).toBe("ok");
    expect(limitState(5, 5)).toBe("at");
    expect(limitState(6, 5)).toBe("over");
  });
});

describe("platformTotals", () => {
  it("sabira firme/vozila/vozače", () => {
    expect(platformTotals([
      { vehicles_used: 2, drivers_used: 3 },
      { vehicles_used: 5, drivers_used: 1 },
    ])).toEqual({ companies: 2, vehicles: 7, drivers: 4 });
  });
  it("prazna lista", () => {
    expect(platformTotals([])).toEqual({ companies: 0, vehicles: 0, drivers: 0 });
  });
});
