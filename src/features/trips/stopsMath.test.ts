import { destinationFromStops } from "./stopsMath";

describe("destinationFromStops", () => {
  it("uzima mesto POSLEDNJEG istovara", () => {
    expect(
      destinationFromStops([
        { kind: "loading", place: "Beograd" },
        { kind: "unloading", place: "Zagreb" },
        { kind: "unloading", place: "München" },
      ]),
    ).toBe("München");
  });

  it("ignoriše utovare posle poslednjeg istovara", () => {
    expect(
      destinationFromStops([
        { kind: "unloading", place: "Zagreb" },
        { kind: "loading", place: "Wien" },
      ]),
    ).toBe("Zagreb");
  });

  it("trimuje mesto", () => {
    expect(destinationFromStops([{ kind: "unloading", place: "  Graz  " }])).toBe("Graz");
  });

  it("preskače prazan istovar (bira prethodni sa mestom)", () => {
    expect(
      destinationFromStops([
        { kind: "unloading", place: "Linz" },
        { kind: "unloading", place: "   " },
      ]),
    ).toBe("Linz");
  });

  it("null kad nema istovara", () => {
    expect(destinationFromStops([{ kind: "loading", place: "Beograd" }])).toBeNull();
  });

  it("null za prazan niz", () => {
    expect(destinationFromStops([])).toBeNull();
  });
});
