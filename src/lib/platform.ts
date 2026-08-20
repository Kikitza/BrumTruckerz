// Platformske grane (F3). Web je UVEK ONLINE i KANCELARIJSKI (owner/dispatcher/admin);
// native-only moduli (offline red/sqlite, print/sharing, push, datetimepicker…) se granaju odavde.
import { Platform, useWindowDimensions } from "react-native";

export const isWeb = Platform.OS === "web";
export const isNative = !isWeb;

// „Širok web" (F3): tabele/desktop UI se uključuju samo na webu iznad ~900px; ispod toga i na
// native-u ostaju postojeće kartice 1:1.
export function useWideWeb(min = 900): boolean {
  const { width } = useWindowDimensions();
  return isWeb && width >= min;
}
