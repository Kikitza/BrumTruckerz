// Klijentski uuid v4 za offline stavke (prilozi, trošak). Bitno je da je RFC4122 v4
// oblik ispravan (postaje pk u bazi) i da su vrednosti praktično jedinstvene.
import { uuidv4 } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv4", () => {
  it("ima ispravan v4 oblik (verzija 4, varijanta 8/9/a/b)", () => {
    expect(uuidv4()).toMatch(V4);
  });
  it("dužina 36 sa crticama na pravim mestima", () => {
    const id = uuidv4();
    expect(id).toHaveLength(36);
    expect([id[8], id[13], id[18], id[23]]).toEqual(["-", "-", "-", "-"]);
  });
  it("praktično jedinstven (1000 uzastopnih bez ponavljanja)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(uuidv4());
    expect(set.size).toBe(1000);
  });
});
