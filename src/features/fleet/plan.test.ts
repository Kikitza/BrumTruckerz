import { canAddVehicle, isVehicleLimitError } from "./plan";

describe("canAddVehicle", () => {
  it("dozvoljava dok je ispod limita", () => {
    expect(canAddVehicle(0, 5)).toBe(true);
    expect(canAddVehicle(4, 5)).toBe(true);
  });
  it("blokira na i preko limita", () => {
    expect(canAddVehicle(5, 5)).toBe(false);
    expect(canAddVehicle(6, 5)).toBe(false);
  });
});

describe("isVehicleLimitError", () => {
  it("prepoznaje bazni trigger", () => {
    expect(isVehicleLimitError("VEHICLE_LIMIT_REACHED: 5 vozila (limit paketa)")).toBe(true);
  });
  it("ignoriše druge greške / prazno", () => {
    expect(isVehicleLimitError("duplicate key value")).toBe(false);
    expect(isVehicleLimitError(null)).toBe(false);
    expect(isVehicleLimitError(undefined)).toBe(false);
  });
});
