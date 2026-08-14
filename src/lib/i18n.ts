// i18n od prvog reda (pravilo #7): nijedan string direktno u komponenti.
// Spremno za sve evropske jezike — dodavanje jezika = novi JSON, nula koda.
//
// Intl.PluralRules polyfill MORA biti prvi (Hermes ga nema) — bez njega i18next
// prijavljuje upozorenje i množinski oblici (npr. srpski few/other) ne rade.
import "intl-pluralrules";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "../locales/en.json";
import sr from "../locales/sr.json";

const device = Localization.getLocales()[0]?.languageCode ?? "en";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sr: { translation: sr } },
  lng: device,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
