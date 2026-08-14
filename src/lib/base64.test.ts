// Dekoder se koristi na putu slike (base64 -> bajtovi -> Supabase Storage). Pogrešan
// dekoder = pokvarena slika, pa proveravamo tačnost na poznatim vektorima.
import { base64ToBytes } from "./base64";

const bytes = (...n: number[]) => Uint8Array.from(n);

describe("base64ToBytes", () => {
  it("dekodira ASCII tekst (\"Man\" -> TWFu)", () => {
    expect(base64ToBytes("TWFu")).toEqual(bytes(77, 97, 110));
  });
  it("radi sa paddingom '==' ", () => {
    expect(base64ToBytes("AAECAw==")).toEqual(bytes(0, 1, 2, 3));
  });
  it("radi sa paddingom '=' (\"hello\" -> aGVsbG8=)", () => {
    expect(base64ToBytes("aGVsbG8=")).toEqual(bytes(104, 101, 108, 108, 111));
  });
  it("ignoriše whitespace/newline u ulazu", () => {
    expect(base64ToBytes("TW\nFu")).toEqual(bytes(77, 97, 110));
  });
  it("prazan ulaz -> prazan niz", () => {
    expect(base64ToBytes("")).toEqual(bytes());
  });
  it("puni bajt raspon (0x00..0xFF round-trip)", () => {
    // btoa nije garantovan u svakom okruženju, pa koristimo fiksni base64 za [0,127,255].
    expect(base64ToBytes("AH//")).toEqual(bytes(0, 127, 255));
  });
});
