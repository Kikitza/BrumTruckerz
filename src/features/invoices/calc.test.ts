import {
  round2, computeInvoiceAmounts, formatInvoiceNo, proposeDueDate, invoiceDisplayStatus,
} from "./calc";

describe("round2", () => {
  it("zaokružuje na 2 decimale", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(100)).toBe(100);
  });
});

describe("computeInvoiceAmounts", () => {
  it("osnova + PDV + ukupno (round2)", () => {
    expect(computeInvoiceAmounts(1000, 20)).toEqual({ amount: 1000, vatAmount: 200, total: 1200 });
    expect(computeInvoiceAmounts(999.99, 20)).toEqual({ amount: 999.99, vatAmount: 200, total: 1199.99 });
    expect(computeInvoiceAmounts(1500, 0)).toEqual({ amount: 1500, vatAmount: 0, total: 1500 });
  });
  it("nezgodno zaokruživanje", () => {
    // 100.10 * 8.5% = 8.5085 -> 8.51 ; total 108.61
    expect(computeInvoiceAmounts(100.1, 8.5)).toEqual({ amount: 100.1, vatAmount: 8.51, total: 108.61 });
  });
});

describe("formatInvoiceNo", () => {
  it("<prefix><GODINA>-<NNN>", () => {
    expect(formatInvoiceNo("", 2026, 1)).toBe("2026-001");
    expect(formatInvoiceNo("BT-", 2026, 42)).toBe("BT-2026-042");
    expect(formatInvoiceNo("", 2026, 1234)).toBe("2026-1234");
  });
});

describe("proposeDueDate", () => {
  it("izdavanje + rok (dana)", () => {
    expect(proposeDueDate("2026-08-20", 30)).toBe("2026-09-19");
    expect(proposeDueDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(proposeDueDate("2026-08-20", 0)).toBe("2026-08-20");
  });
});

describe("invoiceDisplayStatus", () => {
  const today = "2026-08-20";
  it("izdata sa prošlim rokom -> overdue (KASNI)", () => {
    expect(invoiceDisplayStatus("issued", "2026-08-19", today)).toBe("overdue");
  });
  it("izdata sa budućim rokom ostaje issued", () => {
    expect(invoiceDisplayStatus("issued", "2026-08-27", today)).toBe("issued");
    expect(invoiceDisplayStatus("issued", null, today)).toBe("issued");
  });
  it("plaćena/stornirana se ne menjaju bez obzira na rok", () => {
    expect(invoiceDisplayStatus("paid", "2026-01-01", today)).toBe("paid");
    expect(invoiceDisplayStatus("cancelled", "2026-01-01", today)).toBe("cancelled");
  });
});
