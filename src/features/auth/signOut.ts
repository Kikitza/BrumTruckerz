// Deljena odjava (potvrda -> signOut -> nazad na prijavu). Koriste je vlasnički
// Settings i vozačev ekran — jedna logika, bez dupliranja (KVALITET KODA #1).
//
// Ako u redu ima nesinhronizovanih stavki (audit B4), potvrda to napominje —
// stavke su vezane za korisnika i poslaće se kad se ponovo prijavi (ne gube se).
//
// Potvrda ide kroz `confirmAction` (web-safe): na native-u Alert, na webu window.confirm —
// jer je RN Alert.alert NO-OP na webu, pa je odjava ranije izgledala „mrtvo" u browseru.
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { pendingCount } from "../../lib/offline/queue";
import { confirmAction } from "../../lib/confirm";

export function useSignOut() {
  const { t } = useTranslation();
  return async () => {
    let msg = t("settings.signOutConfirm");
    try {
      if ((await pendingCount()) > 0) msg = `${msg}\n\n${t("account.signOutPending")}`;
    } catch {
      // ako provera reda padne, i dalje dozvoli odjavu sa standardnom porukom
    }
    const ok = await confirmAction({
      title: t("settings.signOut"),
      message: msg,
      confirmLabel: t("settings.signOut"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    await supabase.auth.signOut();
    router.replace("/(auth)/sign-in");
  };
}
