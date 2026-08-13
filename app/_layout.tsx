// Root: i18n (side-effect), teme, React Query, offline sync start.
import "../src/lib/i18n";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { startSync } from "../src/lib/offline/queue";
import { registerAllHandlers } from "../src/lib/offline/handlers";

const qc = new QueryClient();

export default function RootLayout() {
  useEffect(() => {
    registerAllHandlers();
    startSync();
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
