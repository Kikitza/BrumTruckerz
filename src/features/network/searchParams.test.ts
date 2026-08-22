import { buildSearchParams, certList, type NetworkFilters } from "./searchParams";

const F = (over: Partial<NetworkFilters> = {}): NetworkFilters => ({
  role: null, country: null, language: null, availableOnly: false, ...over,
});

describe("buildSearchParams", () => {
  test("prazni filteri → svi null, availableOnly false, podrazumevana strana", () => {
    expect(buildSearchParams(F())).toEqual({
      p_role: null, p_country: null, p_language: null,
      p_available_only: false, p_limit: 50, p_offset: 0,
    });
  });

  test("prazan/whitespace string → null (RPC tretira kao bez filtera)", () => {
    expect(buildSearchParams(F({ role: "  ", country: "" })).p_role).toBeNull();
    expect(buildSearchParams(F({ country: "" })).p_country).toBeNull();
  });

  test("vrednosti se trimuju i prosleđuju", () => {
    const p = buildSearchParams(F({ role: "driver", country: " DE ", language: "de", availableOnly: true }));
    expect(p.p_role).toBe("driver");
    expect(p.p_country).toBe("DE");
    expect(p.p_language).toBe("de");
    expect(p.p_available_only).toBe(true);
  });

  test("paginacija: offset = page * pageSize; negativna strana → 0", () => {
    expect(buildSearchParams(F(), 2, 20).p_offset).toBe(40);
    expect(buildSearchParams(F(), 2, 20).p_limit).toBe(20);
    expect(buildSearchParams(F(), -1).p_offset).toBe(0);
  });
});

describe("certList", () => {
  test("niz stringova prolazi; ne-stringovi se filtriraju", () => {
    expect(certList(["ADR", "CPC", 5, null])).toEqual(["ADR", "CPC"]);
  });
  test("jsonb podrazumevani prazan objekat / null → prazna lista", () => {
    expect(certList({})).toEqual([]);
    expect(certList(null)).toEqual([]);
    expect(certList(undefined)).toEqual([]);
  });
});
