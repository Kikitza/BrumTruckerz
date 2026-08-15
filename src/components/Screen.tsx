// Zajednički omotač ekrana BEZ nativnog headera (login, gate/NoRole):
// safe-area insets (gornji = statusna traka/notch, donji = home indikator) na
// JEDNOM mestu + tematizovana pozadina. Ekrani sa nativnim headerom (Tabs)
// insete dobijaju od navigacije, pa NE koriste ovaj wrapper.
import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";

export function Screen({
  children, style, top = true, bottom = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  top?: boolean;
  bottom?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.bg, paddingTop: top ? insets.top : 0, paddingBottom: bottom ? insets.bottom : 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}
