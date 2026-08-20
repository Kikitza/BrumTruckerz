// Platformske grane (F3). Web je UVEK ONLINE i KANCELARIJSKI (owner/dispatcher/admin);
// native-only moduli (offline red/sqlite, print/sharing, push, datetimepicker…) se granaju odavde.
import { Platform } from "react-native";

export const isWeb = Platform.OS === "web";
export const isNative = !isWeb;
