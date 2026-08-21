// Web-safe potvrda destruktivne/važne akcije. Vraća Promise<boolean>.
//
// ZAŠTO: React Native `Alert.alert` sa dugmadima je NO-OP na react-native-web
// (dijalog se ne prikaže, `onPress` se nikad ne pozove) → na webu je potvrda „progutana",
// pa akcija (npr. odjava) izgleda kao da ništa ne radi. Zato:
//   - native: `Alert.alert` (cancel/destructive) — postojeće ponašanje 1:1;
//   - web: `window.confirm` (sinhroni browser dijalog koji RADI).
// Jedno rešenje za sve ekrane (KVALITET KODA #1 — bez dupliranja po ekranu).
import { Alert, Platform } from "react-native";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean; // native stil dugmeta (default true)
};

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const { title, message, confirmLabel, cancelLabel, destructive = true } = opts;

  if (Platform.OS === "web") {
    if (typeof window === "undefined" || typeof window.confirm !== "function") return Promise.resolve(true);
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
