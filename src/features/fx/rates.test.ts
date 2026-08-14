// FX obračun troška (pravila #4/#5) — matematiku para računa KOD. Ovo su testovi te
// matematike: ista valuta, ručni override, zaokruživanje na 2 decimale i OBAVEZNO
// ponašanje kad kursa nema. Mreža (getRate/fetch) se dodiruje samo u „nema kursa" testu.
import { computeBase, getRate } from "./rates";

describe("getRate", () => {
  it("vraća kurs kad odgovor sadrži traženu valutu", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.92 } }),
    } as Response);
    try {
      expect(await getRate("USD", "EUR", "2026-01-15")).toBe(0.92);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("null kad odgovor nema traženu valutu", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ rates: {} }),
    } as Response);
    try {
      expect(await getRate("USD", "EUR", "2026-01-15")).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("null na ne-ok odgovor", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);
    try {
      expect(await getRate("USD", "EUR", "2026-01-15")).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("null kad fetch baci (mreža nedostupna) — bez rušenja", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(new Error("network"));
    try {
      expect(await getRate("USD", "EUR", "2026-01-15")).toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("computeBase", () => {
  it("ista valuta -> kurs 1, iznos nepromenjen (bez mreže)", async () => {
    const r = await computeBase(100, "EUR", "EUR", "2026-01-15");
    expect(r).toEqual({ fx_rate: 1, fx_rate_date: "2026-01-15", base_amount: 100 });
  });

  it("ručni override kursa se koristi umesto povlačenja (bez mreže)", async () => {
    const r = await computeBase(100, "USD", "EUR", "2026-01-15", 0.9);
    expect(r.fx_rate).toBe(0.9);
    expect(r.fx_rate_date).toBe("2026-01-15");
    expect(r.base_amount).toBe(90);
  });

  it("base_amount se zaokružuje na 2 decimale", async () => {
    // 10 * 0.12345 = 1.2345 -> 1.23
    expect((await computeBase(10, "USD", "EUR", "2026-01-15", 0.12345)).base_amount).toBe(1.23);
    // 100 * 0.11115 = 11.115 -> 11.12 (round half up)
    expect((await computeBase(100, "USD", "EUR", "2026-01-15", 0.11115)).base_amount).toBe(11.12);
  });

  it("override radi i kad su valute iste (eksplicitni kurs pobeđuje pravilo from===to)", async () => {
    const r = await computeBase(50, "EUR", "EUR", "2026-01-15", 1.05);
    expect(r.fx_rate).toBe(1.05);
    expect(r.base_amount).toBe(52.5);
  });

  it("baca grešku kad kursa nema (različite valute, bez override-a)", async () => {
    // getRate -> fetch vrati ne-ok -> null -> computeBase mora da baci (nikad tiho 0).
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: false } as Response);
    try {
      await expect(computeBase(100, "USD", "EUR", "2026-01-15")).rejects.toThrow(/Nema kursa/);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
