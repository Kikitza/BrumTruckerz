// Root: i18n (side-effect), teme, React Query, offline sync start.
import "../src/lib/i18n";
import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { startSync } from "../src/lib/offline/queue";
import { registerAllHandlers } from "../src/lib/offline/handlers";
import { initStoredLanguage } from "../src/i18n/useLanguage";
import { useTheme } from "../src/lib/theme";

const qc = new QueryClient();

// Prikaz obaveštenja i dok je aplikacija otvorena (banner + zvuk; bez badge brojača).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  // SDK 54 (Android) je edge-to-edge: sistemske trake su providne, ikonice se boje
  // po temi (svetla tema -> tamne ikonice i obrnuto). Prati ručni override teme.
  const { scheme } = useTheme();
  useEffect(() => {
    initStoredLanguage();
    registerAllHandlers();
    startSync();
  }, []);

  // Tap na obaveštenje o roku -> otvori „Rokovi" (opomene idu vlasnicima).
  useEffect(() => {
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
