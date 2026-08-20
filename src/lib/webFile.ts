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
