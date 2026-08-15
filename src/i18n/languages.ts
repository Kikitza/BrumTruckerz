// JEDINI izvor istine za jezike (pravilo KVALITET: bez dupliranja).
// Ovde je sve na jednom mestu: kod jezika, naziv NA TOM jeziku, zastava (SVG
// komponenta), da li je prevod verifikovan (ljudski) ili mašinski, i sam resurs.
// Dodavanje jezika = jedan red ovde + locales/<kod>.json + zastava u assets/flags/.
import type { FC } from "react";
import type { SvgProps } from "react-native-svg";

// Zastave (flag-icons, MIT; v. assets/flags/README.md). Ime = ISO zemlje.
import FlagRS from "../../assets/flags/rs.svg";
import FlagGB from "../../assets/flags/gb.svg";
import FlagDE from "../../assets/flags/de.svg";
import FlagFR from "../../assets/flags/fr.svg";
import FlagES from "../../assets/flags/es.svg";
import FlagIT from "../../assets/flags/it.svg";
import FlagPT from "../../assets/flags/pt.svg";
import FlagNL from "../../assets/flags/nl.svg";
import FlagPL from "../../assets/flags/pl.svg";
import FlagCZ from "../../assets/flags/cz.svg";
import FlagSK from "../../assets/flags/sk.svg";
import FlagHU from "../../assets/flags/hu.svg";
import FlagRO from "../../assets/flags/ro.svg";
import FlagBG from "../../assets/flags/bg.svg";
import FlagHR from "../../assets/flags/hr.svg";
import FlagSI from "../../assets/flags/si.svg";
import FlagGR from "../../assets/flags/gr.svg";
import FlagSE from "../../assets/flags/se.svg";
import FlagDK from "../../assets/flags/dk.svg";
import FlagFI from "../../assets/flags/fi.svg";
import FlagNO from "../../assets/flags/no.svg";
import FlagEE from "../../assets/flags/ee.svg";
import FlagLV from "../../assets/flags/lv.svg";
import FlagLT from "../../assets/flags/lt.svg";
import FlagUA from "../../assets/flags/ua.svg";
import FlagRU from "../../assets/flags/ru.svg";
import FlagTR from "../../assets/flags/tr.svg";
import FlagAL from "../../assets/flags/al.svg";
import FlagMK from "../../assets/flags/mk.svg";
import FlagBA from "../../assets/flags/ba.svg";

// Prevodi (verifikovani + mašinski). Mašinski nose "_status":"machine".
import sr from "../locales/sr.json";
import en from "../locales/en.json";
import de from "../locales/de.json";
import fr from "../locales/fr.json";
import es from "../locales/es.json";
import it from "../locales/it.json";
import pt from "../locales/pt.json";
import nl from "../locales/nl.json";
import pl from "../locales/pl.json";
import cs from "../locales/cs.json";
import sk from "../locales/sk.json";
import hu from "../locales/hu.json";
import ro from "../locales/ro.json";
import bg from "../locales/bg.json";
import hr from "../locales/hr.json";
import sl from "../locales/sl.json";
import el from "../locales/el.json";
import sv from "../locales/sv.json";
import da from "../locales/da.json";
import fi from "../locales/fi.json";
import no from "../locales/no.json";
import et from "../locales/et.json";
import lv from "../locales/lv.json";
import lt from "../locales/lt.json";
import uk from "../locales/uk.json";
import ru from "../locales/ru.json";
import tr from "../locales/tr.json";
import sq from "../locales/sq.json";
import mk from "../locales/mk.json";
import bs from "../locales/bs.json";

export type Language = {
  code: string;
  name: string; // naziv jezika NA TOM jeziku
  Flag: FC<SvgProps>;
  verified: boolean; // true = ljudski proveren (sr, en); false = mašinski ("beta")
  translation: Record<string, unknown>;
};

// Redosled: verifikovani prvi, pa ostali (redosled iz zadatka).
export const LANGUAGES: Language[] = [
  { code: "sr", name: "Српски", Flag: FlagRS, verified: true, translation: sr },
  { code: "en", name: "English", Flag: FlagGB, verified: true, translation: en },
  { code: "de", name: "Deutsch", Flag: FlagDE, verified: false, translation: de },
  { code: "fr", name: "Français", Flag: FlagFR, verified: false, translation: fr },
  { code: "es", name: "Español", Flag: FlagES, verified: false, translation: es },
  { code: "it", name: "Italiano", Flag: FlagIT, verified: false, translation: it },
  { code: "pt", name: "Português", Flag: FlagPT, verified: false, translation: pt },
  { code: "nl", name: "Nederlands", Flag: FlagNL, verified: false, translation: nl },
  { code: "pl", name: "Polski", Flag: FlagPL, verified: false, translation: pl },
  { code: "cs", name: "Čeština", Flag: FlagCZ, verified: false, translation: cs },
  { code: "sk", name: "Slovenčina", Flag: FlagSK, verified: false, translation: sk },
  { code: "hu", name: "Magyar", Flag: FlagHU, verified: false, translation: hu },
  { code: "ro", name: "Română", Flag: FlagRO, verified: false, translation: ro },
  { code: "bg", name: "Български", Flag: FlagBG, verified: false, translation: bg },
  { code: "hr", name: "Hrvatski", Flag: FlagHR, verified: false, translation: hr },
  { code: "sl", name: "Slovenščina", Flag: FlagSI, verified: false, translation: sl },
  { code: "el", name: "Ελληνικά", Flag: FlagGR, verified: false, translation: el },
  { code: "sv", name: "Svenska", Flag: FlagSE, verified: false, translation: sv },
  { code: "da", name: "Dansk", Flag: FlagDK, verified: false, translation: da },
  { code: "fi", name: "Suomi", Flag: FlagFI, verified: false, translation: fi },
  { code: "no", name: "Norsk", Flag: FlagNO, verified: false, translation: no },
  { code: "et", name: "Eesti", Flag: FlagEE, verified: false, translation: et },
  { code: "lv", name: "Latviešu", Flag: FlagLV, verified: false, translation: lv },
  { code: "lt", name: "Lietuvių", Flag: FlagLT, verified: false, translation: lt },
  { code: "uk", name: "Українська", Flag: FlagUA, verified: false, translation: uk },
  { code: "ru", name: "Русский", Flag: FlagRU, verified: false, translation: ru },
  { code: "tr", name: "Türkçe", Flag: FlagTR, verified: false, translation: tr },
  { code: "sq", name: "Shqip", Flag: FlagAL, verified: false, translation: sq },
  { code: "mk", name: "Македонски", Flag: FlagMK, verified: false, translation: mk },
  { code: "bs", name: "Bosanski", Flag: FlagBA, verified: false, translation: bs },
];

const BY_CODE: Record<string, Language> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
);

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export function getLanguage(code?: string | null): Language | undefined {
  return code ? BY_CODE[code] : undefined;
}

export function isSupported(code?: string | null): boolean {
  return !!code && code in BY_CODE;
}
