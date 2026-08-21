// Brend (ETNOP) — PRIKAZNI sloj. Ovo su JEDINE brend konstante u kodu.
// BRAND_TAGLINE se NE prevodi: brend ostaje na engleskom u svih 30 jezika (enterprise standard).
//
// Brend ≠ identitet. Tehnički/pravni identifikatori NISU brend i NE menjaju se rebrandom:
//   android.package/bundleId `com.brumtruckerz.app`, `scheme`, EAS slug/projekat,
//   Supabase project refs, storage ključevi, seed email domen, javni brojevi BT-D/BT-T.
// Interno nasleđe „brumtruckerz" u tim identifikatorima je TRAJNO.
export const BRAND_NAME = "ETNOP";
export const BRAND_TAGLINE = "European Transport Network Operations Platform";

// Fiksna brend paleta (boot/splash — pre nego što se tema razreši). Namerno NIJE tema-token:
// boot ekran je uvek tamni brend badge. Znak/mreža: cijan + mint (v. assets/brand/etnop-*.svg).
export const BRAND_BG = "#0B1220";
export const BRAND_CYAN = "#22D3EE";
export const BRAND_MINT = "#5EEAD4";
