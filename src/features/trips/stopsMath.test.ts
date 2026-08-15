import { destinationFromStops, reconcileStops } from "./stopsMath";

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

describe("reconcileStops", () => {
  it("briše uklonjene, ažurira zadržane", () => {
    const r = reconcileStops(["a", "b"], [{ existingId: "a", kind: "loading", place: "BG", note: "" }]);
    expect(r.toDelete).toEqual(["b"]);
    expect(r.toUpdate).toEqual([{ id: "a", seq: 1, kind: "loading", place: "BG", note: null }]);
    expect(r.toInsert).toEqual([]);
  });

  it("ubacuje nove sa seq po redosledu", () => {
    const r = reconcileStops([], [
      { existingId: null, kind: "loading", place: "BG", note: "a" },
      { existingId: null, kind: "unloading", place: "MUC", note: "" },
    ]);
    expect(r.toInsert).toEqual([
      { seq: 1, kind: "loading", place: "BG", note: "a" },
      { seq: 2, kind: "unloading", place: "MUC", note: null },
    ]);
  });

  it("seq prati NOVI redosled (reorder postojećih)", () => {
    const r = reconcileStops(["a", "b"], [
      { existingId: "b", kind: "unloading", place: "MUC", note: "" },
      { existingId: "a", kind: "loading", place: "BG", note: "" },
    ]);
    expect(r.toUpdate).toEqual([
      { id: "b", seq: 1, kind: "unloading", place: "MUC", note: null },
      { id: "a", seq: 2, kind: "loading", place: "BG", note: null },
    ]);
    expect(r.toDelete).toEqual([]);
  });

  it("preskače praznu stanicu; njen postojeći red ide u brisanje", () => {
    const r = reconcileStops(["a"], [{ existingId: "a", kind: "loading", place: "   ", note: "x" }]);
    expect(r.toDelete).toEqual(["a"]);
    expect(r.toUpdate).toEqual([]);
    expect(r.toInsert).toEqual([]);
  });

  it("trimuje mesto i napomenu", () => {
    const r = reconcileStops([], [{ existingId: null, kind: "loading", place: "  BG  ", note: "  hi  " }]);
    expect(r.toInsert).toEqual([{ seq: 1, kind: "loading", place: "BG", note: "hi" }]);
  });
});
