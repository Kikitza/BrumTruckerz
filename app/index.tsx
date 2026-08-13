// Gate po ulozi (pravilo #2 živi i u navigaciji): owner/platform_admin -> (owner),
// driver -> (driver). FAIL-CLOSED: bez UTVRĐENE uloge NIKAD ne vodimo na owner ekrane.
import { Redirect } from "expo-router";
import { ActivityIndicator, View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useSession } from "../src/features/auth/useSession";
import { supabase } from "../src/lib/supabase";
import { useTheme } from "../src/lib/theme";

export default function Index() {
  const { session, role, loading } = useSession();

  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (role === "driver") return <Redirect href="/(driver)" />;
  if (role === "owner" || role === "platform_admin") return <Redirect href="/(owner)/trips" />;
  // Rola nepoznata (null / greška / nalog nije povezan sa firmom) -> NE owner.
  return <NoRole />;
}

function NoRole() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: colors.bg }}>
      <Text style={{ color: colors.text, fontSize: 16, textAlign: "center" }}>{t("auth.noRole")}</Text>
      <Pressable
        onPress={() => supabase.auth.signOut()}
        style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
    </View>
  );
}
