// Root: i18n (side-effect), teme, React Query, offline sync start.
import "../src/lib/i18n";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { startSync, setQueueSession } from "../src/lib/offline/queue";
import { registerAllHandlers } from "../src/lib/offline/handlers";
import { initStoredLanguage } from "../src/i18n/useLanguage";
import { supabase } from "../src/lib/supabase";
import { useTheme } from "../src/lib/theme";
import { isWeb } from "../src/lib/platform";

const qc = new QueryClient();

// Prikaz obaveštenja i dok je aplikacija otvorena (banner + zvuk; bez badge brojača).
// Native-only: web nema push (F3 — web je uvek online/kancelarijski).
if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function RootLayout() {
  // SDK 54 (Android) je edge-to-edge: sistemske trake su providne, ikonice se boje
  // po temi (svetla tema -> tamne ikonice i obrnuto). Prati ručni override teme.
  const { colors, scheme } = useTheme();

  // WEB (F3): ofarbaj podlogu stranice (html/body) bojom aktivne teme — da nijedan ekran
  // nikad ne pokaže belo van sadržaja (npr. bočne margine centriranog kontejnera).
  useEffect(() => {
    if (!isWeb || typeof document === "undefined") return;
    document.documentElement.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
  }, [colors.bg]);
  useEffect(() => {
    initStoredLanguage();
    // Offline red (expo-sqlite) je NATIVE-ONLY — web je uvek online (F3).
    if (!isWeb) {
      registerAllHandlers();
      startSync();
    }
  }, []);

  // Veži offline red za aktivnu sesiju (audit B4): stavke se stamp-uju user_id/company_id,
  // flush šalje SAMO stavke aktivne sesije (deljeni uređaj -> nema prelivanja u pogrešnu firmu).
  useEffect(() => {
    const apply = async (uid: string | null) => {
      if (!uid) { setQueueSession(null, null); return; }
      const { data } = await supabase.from("app_users").select("company_id").eq("id", uid).single();
      setQueueSession(uid, (data?.company_id as string | null) ?? null);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { void apply(s?.user.id ?? null); });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Tap na obaveštenje o roku -> otvori „Rokovi" (opomene idu vlasnicima). Native-only.
  useEffect(() => {
    if (isWeb) return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push("/(owner)/reminders");
    });
    return () => sub.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
