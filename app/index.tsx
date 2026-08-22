// Gate po ulozi (pravilo #2 živi i u navigaciji): owner/platform_admin -> (owner),
// driver -> (driver). FAIL-CLOSED: bez UTVRĐENE uloge NIKAD ne vodimo na owner ekrane.
import { Redirect } from "expo-router";
import { Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSession } from "../src/features/auth/useSession";
import { useSignOut } from "../src/features/auth/signOut";
import { SuspendedScreen } from "../src/features/auth/SuspendedScreen";
import { getMyCompanyStatus } from "../src/features/admin/api";
import { WorkerOnboardingHome } from "../src/features/onboarding/WorkerOnboardingHome";
import { isWeb } from "../src/lib/platform";
import { useTheme } from "../src/lib/theme";
import { Screen } from "../src/components/Screen";
import { BootScreen } from "../src/components/BootScreen";

export default function Index() {
  const { session, role, loading, reloadRole } = useSession();

  if (loading) return <BootScreen />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (role === "platform_admin") return <Redirect href="/(admin)" />;
  // WEB (F3+, ADR 0011 dodatak): vozač NIJE blokiran na webu — dobija lični sloj
  // (Profil/CV + Mrežni profil + Pozivi). OPERATIVA (ture/km) ostaje mobilna: sam
  // operativni ekran prikazuje poruku „u mobilnoj aplikaciji". Zato gate vodi vozača
  // na webu direktno na Profil (lični sloj), a na native-u na operativni koren.
  // Dispečer deli (owner) sekciju sa vlasnikom (matrica ADR 0003); owner-only delovi se
  // skrivaju u samim ekranima (Paket, dispečerske pozivnice).
  if (role === "owner" || role === "dispatcher" || role === "driver") return <CompanyGate role={role} />;
  // Rola null = IDENTITET BEZ FIRME (ADR 0013 dopuna): onboarding dom radnika — gradi mrežni
  // profil, prima pozive, ili uđe kodom / otvori firmu. Po ulasku u firmu → osveži gate.
  return <WorkerOnboardingHome onJoined={reloadRole} />;
}

// Suspension gate: obustavljena firma -> fail-closed ekran (owner I vozač).
// FAIL-CLOSED (audit A3): greška provere statusa NE pušta unutra — blokira sa
// porukom i „pokušaj ponovo" (nikad redirect na osnovu neuspele provere).
function CompanyGate({ role }: { role: "owner" | "dispatcher" | "driver" }) {
  const q = useQuery({ queryKey: ["my-company-status"], queryFn: getMyCompanyStatus, retry: 1 });
  if (q.isLoading) return <BootScreen />;
  if (q.isError) return <StatusCheckFailed onRetry={() => q.refetch()} />;
  if (q.data === "suspended") return <SuspendedScreen />;
  const driverHome = isWeb ? "/(driver)/profile" : "/(driver)"; // web: lični sloj; native: operativa
  return <Redirect href={role === "driver" ? driverHome : "/(owner)/trips"} />;
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

