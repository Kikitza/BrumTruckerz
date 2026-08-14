// Parsiranje korisničkog unosa brojeva (zarez kao decimalni separator, trim, null na
// nevalidno). Koristi se za iznose/litre — mora biti predvidivo.
import { toNum, toInt } from "./num";

describe("toNum", () => {
  it("parsira običan decimalni broj", () => {
    expect(toNum("12.5")).toBe(12.5);
  });
  it("prihvata zarez kao decimalni separator", () => {
    expect(toNum("12,5")).toBe(12.5);
  });
  it("trimuje razmake", () => {
    expect(toNum("  3  ")).toBe(3);
  });
  it("prazan / samo razmaci -> null", () => {
    expect(toNum("")).toBeNull();
    expect(toNum("   ")).toBeNull();
  });
  it("nevalidan tekst -> null", () => {
    expect(toNum("abc")).toBeNull();
    expect(toNum("1.2.3")).toBeNull();
  });
  it("negativan i nula rade", () => {
    expect(toNum("-5")).toBe(-5);
    expect(toNum("0")).toBe(0);
  });
});

describe("toInt", () => {
  it("zaokružuje na najbliži ceo broj", () => {
    expect(toInt("3.6")).toBe(4);
    expect(toInt("3.4")).toBe(3);
  });
  it("radi sa zarezom", () => {
    expect(toInt("12,9")).toBe(13);
  });
  it("nevalidno / prazno -> null", () => {
    expect(toInt("")).toBeNull();
    expect(toInt("abc")).toBeNull();
  });
});
