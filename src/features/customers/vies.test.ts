import { VIES_COUNTRIES, viesCountryCode, isEuVatCountry, normalizeVat, viesMessageKey } from "./vies";

describe("viesCountryCode", () => {
  it("velika slova; GR alias za EL", () => {
    expect(viesCountryCode("de")).toBe("DE");
    expect(viesCountryCode("gr")).toBe("EL");
    expect(viesCountryCode("EL")).toBe("EL");
    expect(viesCountryCode(null)).toBe("");
  });
});

describe("isEuVatCountry", () => {
  it("EU članice true; Srbija/prazno false", () => {
    expect(isEuVatCountry("DE")).toBe(true);
    expect(isEuVatCountry("GR")).toBe(true); // alias EL
    expect(isEuVatCountry("EL")).toBe(true);
    expect(isEuVatCountry("XI")).toBe(true); // Sev. Irska
    expect(isEuVatCountry("RS")).toBe(false);
    expect(isEuVatCountry("US")).toBe(false);
    expect(isEuVatCountry("")).toBe(false);
  });
  it("VIES lista ima 28 kodova (27 članica + XI) i sadrži EL, ne GR", () => {
    expect(VIES_COUNTRIES).toContain("EL");
    expect(VIES_COUNTRIES).not.toContain("GR");
    expect(VIES_COUNTRIES.length).toBe(28);
  });
});

describe("normalizeVat", () => {
  it("velika slova, izbaci razmake/tačke", () => {
    expect(normalizeVat(" de 123.456-789 ", "DE")).toBe("123456789");
  });
  it("skida vodeći kod zemlje ako ga korisnik ukuca", () => {
    expect(normalizeVat("DE123456789", "DE")).toBe("123456789");
    expect(normalizeVat("EL090145420", "GR")).toBe("090145420"); // GR unos, EL prefiks
    expect(normalizeVat("GR090145420", "GR")).toBe("090145420"); // GR prefiks
  });
  it("bez prefiksa ostaje kako jeste", () => {
    expect(normalizeVat("123456789", "DE")).toBe("123456789");
  });
  it("prazno → prazno", () => {
    expect(normalizeVat(null, "DE")).toBe("");
    expect(normalizeVat("", null)).toBe("");
  });
});

describe("viesMessageKey", () => {
  it("mapira ishode na i18n ključeve", () => {
    expect(viesMessageKey("valid")).toBe("customers.vies.valid");
    expect(viesMessageKey("invalid")).toBe("customers.vies.invalid");
    expect(viesMessageKey("unavailable")).toBe("customers.vies.unavailable");
    expect(viesMessageKey("not_eu")).toBe("customers.vies.notEu");
  });
});
