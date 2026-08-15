import { departureKm, arrivalsByStop } from "./eventsMath";

describe("departureKm", () => {
  it("vraća km poslednjeg departure", () => {
    expect(departureKm([
      { type: "departure", km: 1000 },
      { type: "border", km: 1200 },
      { type: "departure", km: 1010 },
    ])).toBe(1010);
  });
  it("null kad nema departure", () => {
    expect(departureKm([{ type: "stop_arrival", km: 5, stop_id: "a" }])).toBeNull();
  });
  it("ignoriše departure bez km", () => {
    expect(departureKm([{ type: "departure", km: null }])).toBeNull();
  });
});

describe("arrivalsByStop", () => {
  it("mapira stop_id -> km, poslednji pobeđuje", () => {
    expect(arrivalsByStop([
      { type: "stop_arrival", km: 100, stop_id: "a" },
      { type: "stop_arrival", km: 200, stop_id: "b" },
      { type: "stop_arrival", km: 150, stop_id: "a" },
    ])).toEqual({ a: 150, b: 200 });
  });
  it("preskače događaje bez stop_id ili km i druge tipove", () => {
    expect(arrivalsByStop([
      { type: "stop_arrival", km: 10, stop_id: null },
      { type: "stop_arrival", km: null, stop_id: "a" },
      { type: "border", km: 20, stop_id: "b" },
    ])).toEqual({});
  });
  it("prazan ulaz -> prazna mapa", () => {
    expect(arrivalsByStop([])).toEqual({});
  });
});
