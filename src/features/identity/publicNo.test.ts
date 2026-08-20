import { formatPublicNo, driverPublicNo, isValidDriverPublicNo } from "./publicNo";

describe("formatPublicNo", () => {
  it("nula-dopunjava na 5 cifara i diže prefiks", () => {
    expect(formatPublicNo("d", 1)).toBe("BT-D-00001");
    expect(formatPublicNo("D", 42)).toBe("BT-D-00042");
    expect(formatPublicNo("t", 7)).toBe("BT-T-00007");
  });
  it("ne skraćuje brojeve preko 5 cifara", () => {
    expect(formatPublicNo("D", 123456)).toBe("BT-D-123456");
  });
});

describe("driverPublicNo", () => {
  it("koristi 'D' prefiks", () => {
    expect(driverPublicNo(3)).toBe("BT-D-00003");
  });
});

describe("isValidDriverPublicNo", () => {
  it("prihvata ispravan format", () => {
    expect(isValidDriverPublicNo("BT-D-00001")).toBe(true);
    expect(isValidDriverPublicNo("BT-D-123456")).toBe(true);
  });
  it("odbija pogrešan format / prazno", () => {
    expect(isValidDriverPublicNo("BT-D-1")).toBe(false); // manje od 5 cifara
    expect(isValidDriverPublicNo("BT-T-00001")).toBe(false); // tura, ne vozač
    expect(isValidDriverPublicNo("bt-d-00001")).toBe(false); // mala slova
    expect(isValidDriverPublicNo("00001")).toBe(false);
    expect(isValidDriverPublicNo(null)).toBe(false);
    expect(isValidDriverPublicNo(undefined)).toBe(false);
  });
});
