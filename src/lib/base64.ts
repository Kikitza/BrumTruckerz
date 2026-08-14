// Dekodiranje base64 -> bajtovi (Uint8Array). Bez zavisnosti, radi u svakom JS engine-u.
// Koristi se pri uploadu slike u Supabase Storage: u React Native-u upload ide preko
// ArrayBuffer/ArrayBufferView (Blob/File/FormData NE rade pouzdano), pa lokalni fajl
// čitamo kao base64 (expo-file-system) pa ga ovde pretvaramo u bajtove.
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < CHARS.length; i++) t[CHARS.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/[^A-Za-z0-9+/]/g, ""); // ukloni padding '=' i whitespace/newline
  const outLen = Math.floor((s.length * 6) / 8); // 4 base64 znaka = 3 bajta
  const out = new Uint8Array(outLen);
  let p = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = LOOKUP[s.charCodeAt(i)];
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[p++] = (buf >> bits) & 0xff;
    }
  }
  return p === out.length ? out : out.subarray(0, p);
}
