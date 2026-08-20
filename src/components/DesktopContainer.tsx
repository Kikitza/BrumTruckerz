// Desktop-pass omotač (F3): SPOLJNI sloj puni CELU širinu bojom aktivne teme (nema belih ivica
// van sadržaja), UNUTRA je centriran max-width kontejner. Na native/uskim ekranima je providan
// (samo flex:1) — ponaša se kao običan ekran. Koriste ga svi desktop-doterani ekrani.
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "../lib/theme";
import { isWeb } from "../lib/platform";

export function DesktopContainer({ children, maxWidth = 1000 }: { children: ReactNode; maxWidth?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[{ flex: 1, backgroundColor: colors.bg }, isWeb && { width: "100%", maxWidth, alignSelf: "center" }]}>
        {children}
      </View>
    </View>
  );
}
