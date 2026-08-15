// i18n od prvog reda (pravilo #7): nijedan string direktno u komponenti.
// Resursi se grade iz JEDNE liste jezika (src/i18n/languages.ts) — dodavanje
// jezika = novi red tamo + JSON, nula izmena ovde.
//
// Intl.PluralRules polyfill MORA biti prvi (Hermes ga nema) — bez njega i18next
// prijavljuje upozorenje i množinski oblici (npr. srpski few/other) ne rade.
import "intl-pluralrules";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import { LANGUAGES, isSupported } from "../i18n/languages";

const resources = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, { translation: l.translation }]),
);

// Prvi start: jezik telefona ako je podržan, inače engleski (fallback).
// Zapamćeni izbor (AsyncStorage) primenjuje se asinhrono u root layout-u.
const device = Localization.getLocales()[0]?.languageCode ?? "en";
const initialLng = isSupported(device) ? device : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: "en", // ključ koji fali/nije preveden → engleski
  interpolation: { escapeValue: false },
});

export default i18n;
