import { detectCountry, normalizePlace } from "./countryDetect";

describe("detectCountry", () => {
  it("eksplicitan kod na kraju → siguran", () => {
    expect(detectCountry("München, DE")).toEqual({ code: "DE", confident: true });
    expect(detectCountry("Milano (IT)")).toEqual({ code: "IT", confident: true });
    expect(detectCountry("Beograd - RS")).toEqual({ code: "RS", confident: true });
  });

  it("ime zemlje u tekstu → siguran (varijante/dijakritika)", () => {
    expect(detectCountry("Nemačka")).toEqual({ code: "DE", confident: true });
    expect(detectCountry("Serbia")).toEqual({ code: "RS", confident: true });
    expect(detectCountry("Bosna i Hercegovina")).toEqual({ code: "BA", confident: true });
    expect(detectCountry("Czech Republic")).toEqual({ code: "CZ", confident: true });
  });

  it("poznat veliki grad → siguran (bez dijakritike)", () => {
    expect(detectCountry("Beograd")).toEqual({ code: "RS", confident: true });
    expect(detectCountry("Munchen")).toEqual({ code: "DE", confident: true });
    expect(detectCountry("Ljubljana, skladiste 3")).toEqual({ code: "SI", confident: true });
    expect(detectCountry("Wien")).toEqual({ code: "AT", confident: true });
  });

  it("nejasno → prazno (za ručnu potvrdu), NE nagađa", () => {
    expect(detectCountry("Skladište kod pumpe")).toEqual({ code: null, confident: false });
    expect(detectCountry("")).toEqual({ code: null, confident: false });
    expect(detectCountry(null)).toEqual({ code: null, confident: false });
    expect(detectCountry("XX nepoznato")).toEqual({ code: null, confident: false });
  });

  it("normalizePlace skida dijakritiku i kolabira razmake", () => {
    expect(normalizePlace("  Kruševac   grad ")).toBe("krusevac grad");
  });
});
