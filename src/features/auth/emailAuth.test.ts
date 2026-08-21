import { emailAuthErrorKey } from "./emailAuth";

describe("emailAuthErrorKey", () => {
  it("pogrešan imejl/lozinka → invalidCredentials", () => {
    expect(emailAuthErrorKey("Invalid login credentials")).toBe("auth.err.invalidCredentials");
    expect(emailAuthErrorKey("invalid_credentials")).toBe("auth.err.invalidCredentials");
  });

  it("mrežna greška → network (ne meša se sa lozinkom)", () => {
    expect(emailAuthErrorKey("Network request failed")).toBe("auth.err.network");
    expect(emailAuthErrorKey("TypeError: Failed to fetch")).toBe("auth.err.network");
  });

  it("nepotvrđen imejl → emailNotConfirmed", () => {
    expect(emailAuthErrorKey("Email not confirmed")).toBe("auth.err.emailNotConfirmed");
  });

  it("nepoznato/prazno → signInFailed (iskren fallback)", () => {
    expect(emailAuthErrorKey("something odd")).toBe("auth.err.signInFailed");
    expect(emailAuthErrorKey("")).toBe("auth.err.signInFailed");
    expect(emailAuthErrorKey(null)).toBe("auth.err.signInFailed");
  });
});
