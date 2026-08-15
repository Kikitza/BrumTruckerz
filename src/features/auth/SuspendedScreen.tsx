// Fail-closed ekran za obustavljenu firmu (owner I vozač). Jedini izlaz je odjava.
import { Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { Screen } from "../../components/Screen";

export function SuspendedScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Screen style={{ alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" }}>{t("suspended.title")}</Text>
      <Text style={{ color: colors.textMuted, textAlign: "center" }}>{t("suspended.body")}</Text>
      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
    </Screen>
  );
}
