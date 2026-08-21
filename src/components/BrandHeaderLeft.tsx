// Znak u zaglavlju aplikacije (owner/driver Tabs) — mali ETNOP mark levo, umesto praznine.
// Tema-svestan (kroz EtnopMark). Zamena za nekadašnji kamion-brend u chrome-u.
import { View } from "react-native";
import { EtnopMark } from "./EtnopMark";

export function BrandHeaderLeft() {
  return (
    <View style={{ marginLeft: 12 }}>
      <EtnopMark size={26} />
    </View>
  );
}
