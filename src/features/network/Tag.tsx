// Mala oznaka (čip) za mrežu — zemlje/jezici/sertifikati. onRemove opciono:
// prisutan → editabilna lista (× briše); odsutan → prikaz na kartici (statično).
// Boje SAMO iz tokena (pravilo #8).
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../../lib/theme";

export function Tag({ label, onRemove }: { label: string; onRemove?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 }}>
      <Text style={{ color: colors.text, fontSize: 13 }}>{label}</Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 16 }}>×</Text>
        </Pressable>
      )}
    </View>
  );
}
