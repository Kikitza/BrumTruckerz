import { CURRENCIES, suggestCurrency } from "./currencies";

describe("suggestCurrency", () => {
  it("očigledne zemlje", () => {
    expect(suggestCurrency("RS")).toBe("RSD");
    expect(suggestCurrency("rs")).toBe("RSD");
    expect(suggestCurrency("GB")).toBe("GBP");
    expect(suggestCurrency("PL")).toBe("PLN");
    expect(suggestCurrency("CH")).toBe("CHF");
  });
  it("eurozona → EUR", () => {
    expect(suggestCurrency("DE")).toBe("EUR");
    expect(suggestCurrency("HR")).toBe("EUR");
  });
  it("nepoznato/prazno → EUR", () => {
    expect(suggestCurrency("NO")).toBe("EUR"); // NOK nije u listi → EUR
    expect(suggestCurrency(null)).toBe("EUR");
    expect(suggestCurrency("")).toBe("EUR");
  });
  it("svi predlozi su u listi podržanih valuta", () => {
    for (const c of ["RS", "GB", "PL", "CH", "DE", "NO", "TR", "BA", "MK"]) {
      expect(CURRENCIES).toContain(suggestCurrency(c));
    }
  });
});
