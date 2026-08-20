import {
  kmRemaining, kmStatus, dateSeverity, worstSeverity, proposeDateFromInterval, applicableKmStage,
} from "./status";

describe("kmStatus (pragovi)", () => {
  it("zeleno > 2000 km preostalo", () => {
    expect(kmStatus(7000, 10000)).toBe("ok"); // 3000 preostalo
  });
  it("žuto ≤ 2000 km (i > 500)", () => {
    expect(kmStatus(8100, 10000)).toBe("yellow"); // 1900
    expect(kmStatus(8000, 10000)).toBe("yellow"); // 2000 (granica)
  });
  it("crveno ≤ 500 km ili prekoračeno", () => {
    expect(kmStatus(9600, 10000)).toBe("red"); // 400
    expect(kmStatus(9500, 10000)).toBe("red"); // 500 (granica)
    expect(kmStatus(10100, 10000)).toBe("red"); // -100 prekoračeno
  });
  it("null kad nema podataka", () => {
    expect(kmStatus(null, 10000)).toBeNull();
    expect(kmStatus(7000, null)).toBeNull();
  });
});

describe("kmRemaining", () => {
  it("razlika due - trenutno", () => {
    expect(kmRemaining(9600, 10000)).toBe(400);
    expect(kmRemaining(10100, 10000)).toBe(-100);
    expect(kmRemaining(null, 10000)).toBeNull();
  });
});

describe("dateSeverity", () => {
  it("isteklo/uskoro/ok", () => {
    expect(dateSeverity(-1)).toBe("red");
    expect(dateSeverity(30)).toBe("yellow");
    expect(dateSeverity(31)).toBe("ok");
  });
});

describe("worstSeverity", () => {
  it("najgori od date/km", () => {
    expect(worstSeverity(["ok", "yellow"])).toBe("yellow");
    expect(worstSeverity(["yellow", "red", "ok"])).toBe("red");
    expect(worstSeverity(["ok", null, undefined])).toBe("ok");
    expect(worstSeverity([])).toBe("ok");
  });
});

describe("proposeDateFromInterval", () => {
  it("dodaje mesece; null meseci → null", () => {
    expect(proposeDateFromInterval("2026-08-20", 12)).toBe("2027-08-20");
    expect(proposeDateFromInterval("2026-08-20", 24)).toBe("2028-08-20");
    expect(proposeDateFromInterval("2026-08-20", null)).toBeNull();
  });
});

describe("applicableKmStage (cron-parity)", () => {
  it("0 / 500 / 2000 / null", () => {
    expect(applicableKmStage(-100)).toBe(0);
    expect(applicableKmStage(0)).toBe(0);
    expect(applicableKmStage(400)).toBe(500);
    expect(applicableKmStage(1500)).toBe(2000);
    expect(applicableKmStage(3000)).toBeNull();
  });
});
