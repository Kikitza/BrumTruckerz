// Podešavanja (vlasnik). MVP: odjava; ostalo (jezik/tema) -> kasnije.
import { View, Text, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "../../src/lib/supabase";
import { useTheme } from "../../src/lib/theme";

export default function Settings() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const signOut = () =>
    Alert.alert(t("settings.signOut"), t("settings.signOutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.signOut"),
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);

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
