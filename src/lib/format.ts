// Lokalizovani formati (pravilo #7): brojevi/datumi/valuta po lokalu uređaja.
import * as Localization from "expo-localization";

const locale = Localization.getLocales()[0]?.languageTag ?? "en";

export const fmtMoney = (n: number, currency = "EUR") =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);

export const fmtNumber = (n: number, digits = 0) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export const fmtKm = (n: number) => `${fmtNumber(n)} km`;
