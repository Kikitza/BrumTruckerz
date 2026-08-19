// Gate po ulozi (pravilo #2 živi i u navigaciji): owner/platform_admin -> (owner),
// driver -> (driver). FAIL-CLOSED: bez UTVRĐENE uloge NIKAD ne vodimo na owner ekrane.
import { Redirect } from "expo-router";
import { ActivityIndicator, View, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "../src/features/auth/useSession";
import { useSignOut } from "../src/features/auth/signOut";
import { SuspendedScreen } from "../src/features/auth/SuspendedScreen";
import { getMyCompanyStatus } from "../src/features/admin/api";
import { useTheme } from "../src/lib/theme";
import { Screen } from "../src/components/Screen";

export default function Index() {
  const { session, role, loading } = useSession();

  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (role === "platform_admin") return <Redirect href="/(admin)" />;
  if (role === "owner" || role === "driver") return <CompanyGate role={role} />;
  // Rola nepoznata (null / greška / nalog nije povezan sa firmom) -> NE owner.
  return <NoRole />;
}

// Suspension gate: obustavljena firma -> fail-closed ekran (owner I vozač).
// FAIL-CLOSED (audit A3): greška provere statusa NE pušta unutra — blokira sa
// porukom i „pokušaj ponovo" (nikad redirect na osnovu neuspele provere).
function CompanyGate({ role }: { role: "owner" | "driver" }) {
  const q = useQuery({ queryKey: ["my-company-status"], queryFn: getMyCompanyStatus, retry: 1 });
  if (q.isLoading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  if (q.isError) return <StatusCheckFailed onRetry={() => q.refetch()} />;
  if (q.data === "suspended") return <SuspendedScreen />;
  return <Redirect href={role === "driver" ? "/(driver)" : "/(owner)/trips"} />;
}

// Provera statusa nije uspela: ne znamo da li je firma aktivna -> blokiraj (fail-closed).
function StatusCheckFailed({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const signOut = useSignOut();
  return (
    <Screen style={{ alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 16, textAlign: "center" }}>{t("account.statusCheckFailed")}</Text>
      <Pressable onPress={onRetry}
        style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 }}>
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("common.retry")}</Text>
      </Pressable>
      <Pressable onPress={signOut}>
        <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
    </Screen>
  );
}

function NoRole() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const signOut = useSignOut(); // deljeni hook (potvrda + odjava) — bez direktnog supabase poziva
  return (
    <Screen style={{ alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ color: colors.text, fontSize: 16, textAlign: "center" }}>{t("auth.noRole")}</Text>
      <Pressable
        onPress={signOut}
        style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 }}
      >
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
    </Screen>
  );
}
