// CV u modalu — office otvara CV radnika svoje firme (iz Flote), a dispečer svoj („Moj CV").
// userId = null → moj CV (self); inače CV ciljanog radnika (RPC-ovi ograničavaju na firmu office-a).
import { View, Text, Pressable, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { ModalScaffold } from "../../components/form";
import { CareerProfileView } from "./CareerProfileView";

export function CareerProfileModal({ userId, onClose }: { userId?: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.done")}</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("career.title")}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <CareerProfileView userId={userId} showHeader />
      </ScrollView>
    </ModalScaffold>
  );
}
