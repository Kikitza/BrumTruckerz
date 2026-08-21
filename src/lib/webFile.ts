// Web-only: izbor fajla sa računara preko skrivenog <input type="file">. Native ovo NE zove
// (grana kroz isWeb). `document` se dodiruje SAMO unutar funkcije → uvoz je bezbedan i na native.
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    const done = (f: File | null) => { input.remove(); resolve(f); };
    input.onchange = () => done(input.files?.[0] ?? null);
    // Neki browseri gađaju oncancel; fokus-fallback nije pouzdan pa se oslanjamo na change.
    input.oncancel = () => done(null);
    document.body.appendChild(input);
    input.click();
  });
}

// Web-only: smanji sliku pre uploada (duža strana <= maxEdge, JPEG kvalitet), zadrži odnos stranica.
// Bez teških biblioteka — koristi ugrađeni <canvas>. Native NE zove ovo (grana kroz isWeb);
// Image/canvas/URL se diraju SAMO unutar funkcije. Ako slika već staje / dekodovanje ne uspe /
// rezultat NIJE manji — vrati original (bez gubitka kvaliteta ili podataka).
export async function compressImageForUpload(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.8;
  const original = async (): Promise<{ bytes: Uint8Array; contentType: string }> => ({
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type || "image/jpeg",
  });

  // Ne diramo ne-slike, animirani GIF ni SVG (animacija/vektor bi se pokvarili rasterizacijom).
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return original();
  }

  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const { width, height } = img;
      if (!width || !height) return await original();
      const scale = Math.min(1, maxEdge / Math.max(width, height)); // samo smanjuje (nikad ne uvećava)
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return await original();
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (!blob || blob.size >= file.size) return await original(); // bez dobitka -> zadrži original
      return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: "image/jpeg" };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return original();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
