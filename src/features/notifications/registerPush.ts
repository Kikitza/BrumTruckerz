// Registracija Expo push tokena posle prijave (obe uloge). Dozvola se traži JEDNOM
// uz kratko objašnjenje; ako je odbijena — NE pitamo ponovo (tražimo dozvolu samo
// kad je status 'undetermined'; OS pamti odbijanje). Token se upsert-uje u push_tokens
// (RLS: korisnik upravlja samo svojim tokenima).
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform, Alert } from "react-native";
import i18n from "../../lib/i18n";
import { BRAND_NAME } from "../../lib/brand";
import { supabase } from "../../lib/supabase";

let attempted = false; // jednom po pokretanju aplikacije (spreči višestruke pokušaje)

export async function registerPushOnce(): Promise<void> {
  if (attempted) return;
  attempted = true;
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;

    if (status === "undetermined") {
      // Kratko objašnjenje pre sistemskog pitanja.
      await new Promise<void>((resolve) => {
        Alert.alert(i18n.t("notif.rationaleTitle"), i18n.t("notif.rationaleBody"), [
          { text: i18n.t("common.done"), onPress: () => resolve() },
        ]);
      });
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return; // odbijeno/nedostupno -> ne pitamo ponovo

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: BRAND_NAME,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid || !token) return;

    await supabase.from("push_tokens").upsert(
      { user_id: uid, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" },
    );
  } catch {
    // Registracija tokena NIJE kritična za rad aplikacije — tiho odustani.
  }
}
