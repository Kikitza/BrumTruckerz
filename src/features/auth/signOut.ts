// Deljena odjava (potvrda -> signOut -> nazad na prijavu). Koriste je vlasnički
// Settings i vozačev ekran — jedna logika, bez dupliranja (KVALITET KODA #1).
import { Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";

export function useSignOut() {
  const { t } = useTranslation();
  return () =>
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
}
