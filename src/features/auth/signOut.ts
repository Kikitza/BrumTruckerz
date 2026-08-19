// Deljena odjava (potvrda -> signOut -> nazad na prijavu). Koriste je vlasnički
// Settings i vozačev ekran — jedna logika, bez dupliranja (KVALITET KODA #1).
//
// Ako u redu ima nesinhronizovanih stavki (audit B4), potvrda to napominje —
// stavke su vezane za korisnika i poslaće se kad se ponovo prijavi (ne gube se).
import { Alert } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { pendingCount } from "../../lib/offline/queue";

export function useSignOut() {
  const { t } = useTranslation();
  return async () => {
    let msg = t("settings.signOutConfirm");
    try {
      if ((await pendingCount()) > 0) msg = `${msg}\n\n${t("account.signOutPending")}`;
    } catch {
      // ako provera reda padne, i dalje dozvoli odjavu sa standardnom porukom
    }
    Alert.alert(t("settings.signOut"), msg, [
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
  };
}
