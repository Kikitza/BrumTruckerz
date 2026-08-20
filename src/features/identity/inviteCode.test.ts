import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  normalizeInviteCode,
  isValidInviteCode,
  isInviteExpired,
  effectiveInviteStatus,
  inviteErrorKey,
} from "./inviteCode";

describe("INVITE_ALPHABET", () => {
  it("izostavlja zabunljive znakove O/0/I/1 i ima 32 znaka", () => {
    expect(INVITE_ALPHABET).not.toMatch(/[O0I1]/);
    expect(INVITE_ALPHABET.length).toBe(32);
    expect(INVITE_CODE_LENGTH).toBe(8);
  });
});

describe("normalizeInviteCode", () => {
  it("diže na velika slova i izbacuje razmake/crtice", () => {
    expect(normalizeInviteCode(" ab2-3cd4 ")).toBe("AB23CD4");
    expect(normalizeInviteCode("abcd2345")).toBe("ABCD2345");
    expect(normalizeInviteCode(null)).toBe("");
    expect(normalizeInviteCode(undefined)).toBe("");
  });
});

describe("isValidInviteCode", () => {
  it("prihvata 8 znakova iz alfabeta (posle normalizacije)", () => {
    expect(isValidInviteCode("ABCD2345")).toBe(true);
    expect(isValidInviteCode("abcd-2345")).toBe(true); // normalizuje pa validira
  });
  it("odbija pogrešnu dužinu i zabranjene znakove", () => {
    expect(isValidInviteCode("ABCD234")).toBe(false); // 7
    expect(isValidInviteCode("ABCD23456")).toBe(false); // 9
    expect(isValidInviteCode("ABCD230O")).toBe(false); // O i 0 nisu u alfabetu
    expect(isValidInviteCode("ABCD2341")).toBe(false); // 1 nije u alfabetu
    expect(isValidInviteCode("")).toBe(false);
    expect(isValidInviteCode(null)).toBe(false);
  });
});

describe("isInviteExpired", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  it("prošlost = istekla, budućnost = nije", () => {
    expect(isInviteExpired("2026-08-19T12:00:00Z", now)).toBe(true);
    expect(isInviteExpired("2026-08-27T12:00:00Z", now)).toBe(false);
  });
  it("tačno sada = istekla (<=)", () => {
    expect(isInviteExpired("2026-08-20T12:00:00Z", now)).toBe(true);
  });
});

describe("effectiveInviteStatus", () => {
  const now = new Date("2026-08-20T12:00:00Z");
  it("pending kome je istekao rok -> expired", () => {
    expect(effectiveInviteStatus("pending", "2026-08-19T00:00:00Z", now)).toBe("expired");
  });
  it("pending u roku ostaje pending", () => {
    expect(effectiveInviteStatus("pending", "2026-08-27T00:00:00Z", now)).toBe("pending");
  });
  it("accepted/cancelled se ne menjaju", () => {
    expect(effectiveInviteStatus("accepted", "2026-01-01T00:00:00Z", now)).toBe("accepted");
    expect(effectiveInviteStatus("cancelled", "2026-01-01T00:00:00Z", now)).toBe("cancelled");
  });
});

describe("inviteErrorKey", () => {
  it("mapira RPC kodove na i18n ključeve", () => {
    expect(inviteErrorKey("INVITE_NOT_FOUND")).toBe("invite.err.notFound");
    expect(inviteErrorKey("… INVITE_EXPIRED …")).toBe("invite.err.expired");
    expect(inviteErrorKey("INVITE_OTHER_COMPANY")).toBe("invite.err.otherCompany");
    expect(inviteErrorKey("INVITE_COMPANY_SUSPENDED")).toBe("invite.err.suspended");
    expect(inviteErrorKey("INVITE_DISPATCHER_NOT_READY")).toBe("invite.err.dispatcherNotReady");
  });
  it("nepoznata poruka -> common.error", () => {
    expect(inviteErrorKey("random db error")).toBe("common.error");
    expect(inviteErrorKey(null)).toBe("common.error");
  });
});
