// Izbor jezika: promena u hodu + pamćenje (AsyncStorage).
// (a) menja jezik cele aplikacije odmah, (b) pamti izbor za sledeće otvaranje.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import i18n from "../lib/i18n";
import { isSupported } from "./languages";

const STORAGE_KEY = "app.language";

// Učitava zapamćeni izbor i primenjuje ga (poziva se jednom, iz root layout-a).
// Ako nema zapamćenog — ostaje detekcija iz i18n.ts (jezik telefona ili en).
export async function initStoredLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isSupported(stored) && stored !== i18n.language) {
      await i18n.changeLanguage(stored as string);
    }
  } catch {
    // bez zapamćenog izbora — koristi se detektovani jezik
  }
}

// Eksplicitan izbor korisnika: primeni + zapamti.
export async function setLanguage(code: string): Promise<void> {
  if (!isSupported(code)) return;
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // pamćenje nije kritično — jezik je već promenjen za tekuću sesiju
  }
}

// Reaktivno trenutni jezik + menjač; koriste ga i login i header.
export function useLanguage(): { current: string; change: (code: string) => Promise<void> } {
  const { i18n: inst } = useTranslation();
  return { current: inst.language, change: setLanguage };
}
