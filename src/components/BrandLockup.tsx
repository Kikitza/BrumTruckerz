// Brend lockup (login): znak + „ETNOP" + tagline, tema-svesno (tekst kroz tokene, čitljiv u
// light i dark). Tagline se NE prevodi (v. src/lib/brand.ts).
import { View, Text } from "react-native";
import { useTheme } from "../lib/theme";
import { EtnopMark } from "./EtnopMark";
import { BRAND_NAME, BRAND_TAGLINE } from "../lib/brand";

export function BrandLockup({ size = 132 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <EtnopMark size={size} />
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 34, fontWeight: "800", letterSpacing: 2, color: colors.text }}>{BRAND_NAME}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, textAlign: "center" }}>{BRAND_TAGLINE}</Text>
      </View>
    </View>
  );
}
