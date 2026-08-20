// „Učitaj još" (server paginacija, F3) — deljeno dugme za sve liste.
import { Pressable, Text } from "react-native";
import type { Palette } from "../lib/theme";

export function LoadMore({ colors, label, onPress }: { colors: Palette; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}
      style={{ margin: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
      <Text style={{ color: colors.primary, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
