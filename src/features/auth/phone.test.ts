import { normalizePhone, isValidPhone, toE164, phoneAuthErrorKey, maskPhone, DEFAULT_DIAL_PREFIX } from "./phone";

describe("normalizePhone", () => {
  it("nacionalni broj sa vodećom 0 -> prefiks bez 0", () => {
    expect(normalizePhone("060 123 4567")).toBe("+381601234567");
    expect(normalizePhone("0601234567", "+381")).toBe("+381601234567");
  });
  it("nacionalni broj bez vodeće 0 -> prefiks + broj", () => {
    expect(normalizePhone("601234567")).toBe("+381601234567");
  });
  it("već E.164 (+) se zadržava, čisti razmake/crtice", () => {
    expect(normalizePhone("+381 60-123 4567")).toBe("+381601234567");
    expect(normalizePhone("+49 151 23456789")).toBe("+4915123456789");
  });
  it("00 međunarodni prefiks -> +", () => {
    expect(normalizePhone("00381601234567")).toBe("+381601234567");
  });
  it("poštuje promenjen podrazumevani prefiks", () => {
    expect(normalizePhone("0151 2345678", "+49")).toBe("+491512345678");
    expect(normalizePhone("601234567", "+385")).toBe("+385601234567");
  });
  it("prazno -> prazno", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });
  it("podrazumevani prefiks je +381", () => {
    expect(DEFAULT_DIAL_PREFIX).toBe("+381");
  });
});

describe("isValidPhone", () => {
  it("prihvata ispravan E.164", () => {
    expect(isValidPhone("+381601234567")).toBe(true);
    expect(isValidPhone("+4915123456789")).toBe(true);
  });
  it("odbija bez +, prekratke, sa slovima", () => {
    expect(isValidPhone("381601234567")).toBe(false); // bez +
    expect(isValidPhone("+3816")).toBe(false); // prekratak
    expect(isValidPhone("+0601234567")).toBe(false); // vodeća 0 posle +
    expect(isValidPhone("+381 60 abc")).toBe(false);
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone(null)).toBe(false);
  });
});

describe("toE164", () => {
  it("spaja prefiks i nacionalni broj", () => {
    expect(toE164("060 123 4567", "+381")).toBe("+381601234567");
    expect(isValidPhone(toE164("601234567", "+381"))).toBe(true);
  });
});

describe("maskPhone", () => {
  it("maskira sredinu, čuva pozivni i poslednje 2 cifre", () => {
    expect(maskPhone("+381600000001")).toBe("+381 •••••••01");
    expect(maskPhone("381600000001")).toBe("+381 •••••••01"); // bez +
  });
  it("prazno/kratko", () => {
    expect(maskPhone(null)).toBe("—");
    expect(maskPhone("")).toBe("—");
    expect(maskPhone("+123")).toBe("+123");
  });
});

describe("phoneAuthErrorKey", () => {
  it("mapira poznate GoTrue greške", () => {
    // GoTrue vraća isti tekst za pogrešan i istekao -> jedna iskrena poruka (otpInvalid)
    expect(phoneAuthErrorKey("Token has expired or is invalid")).toBe("auth.err.otpInvalid");
    expect(phoneAuthErrorKey("Invalid OTP")).toBe("auth.err.otpInvalid");
    // čist „expired" bez „invalid" -> otpExpired
    expect(phoneAuthErrorKey("OTP has expired")).toBe("auth.err.otpExpired");
    expect(phoneAuthErrorKey("For security purposes, you can only request this after 60 seconds"))
      .toBe("auth.err.otpTooMany");
    expect(phoneAuthErrorKey("Too many requests")).toBe("auth.err.otpTooMany");
  });
  it("nepoznato / prazno -> common.error", () => {
    expect(phoneAuthErrorKey("some db failure")).toBe("common.error");
    expect(phoneAuthErrorKey(null)).toBe("common.error");
  });
});
