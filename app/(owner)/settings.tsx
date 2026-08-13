// Podešavanja (vlasnik). MVP: odjava; ostalo (jezik/tema) -> kasnije.
import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../src/features/auth/signOut";
import { useTheme } from "../../src/lib/theme";

export default function Settings() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const signOut = useSignOut();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
      <Pressable
        onPress={signOut}
        style={{
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
          borderRadius: 10, padding: 16, alignItems: "center",
        }}
      >
        <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
    </View>
  );
}
