import { applicableStage, shouldNotify } from "./stage";

describe("applicableStage", () => {
  it("mapira dane na najhitniji dostignut prag", () => {
    expect(applicableStage(45)).toBeNull();
    expect(applicableStage(30)).toBe(30);
    expect(applicableStage(8)).toBe(30);
    expect(applicableStage(7)).toBe(7);
    expect(applicableStage(2)).toBe(7);
    expect(applicableStage(1)).toBe(1);
    expect(applicableStage(0)).toBe(0);
    expect(applicableStage(-3)).toBe(0); // istekao
  });
});

describe("shouldNotify", () => {
  it("prvi put (notified=null) šalje čim je u prozoru", () => {
    expect(shouldNotify(20, null)).toBe(true);
    expect(shouldNotify(45, null)).toBe(false);
  });
  it("ne ponavlja isti prag", () => {
    expect(shouldNotify(20, 30)).toBe(false); // već poslat 30
    expect(shouldNotify(9, 30)).toBe(false);  // i dalje prag 30
  });
  it("šalje kad se uđe u hitniji prag", () => {
    expect(shouldNotify(7, 30)).toBe(true);
    expect(shouldNotify(1, 7)).toBe(true);
    expect(shouldNotify(0, 1)).toBe(true);
    expect(shouldNotify(-1, 1)).toBe(true);
  });
  it("istekao se ne ponavlja (prag 0 već poslat)", () => {
    expect(shouldNotify(-5, 0)).toBe(false);
  });
});
