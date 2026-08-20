// Podešavanja (vlasnik): paket + iskorišćenost vozila, pozivnice, odjava.
import { View, Text, Pressable, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../src/features/auth/signOut";
import { useTheme } from "../../src/lib/theme";
import { getCompanyPlan, countVehicles } from "../../src/features/fleet/api";
import { InvitesSection } from "../../src/features/identity/InvitesSection";

export default function Settings() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const signOut = useSignOut();

  const planQ = useQuery({ queryKey: ["company-plan"], queryFn: getCompanyPlan });
  const vehCountQ = useQuery({ queryKey: ["vehicle-count"], queryFn: countVehicles });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      {/* Paket firme (menja samo platforma) */}
      <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 6 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("plan.title")}</Text>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{planQ.data?.plan ?? "—"}</Text>
        {planQ.data && (
          <Text style={{ color: colors.textMuted }}>
            {t("plan.vehicles", { used: vehCountQ.data ?? 0, limit: planQ.data.vehicle_limit })}
          </Text>
        )}
      </View>

      {/* Pozivnice: generiši kod, vlasnik ga prosleđuje sam */}
      <InvitesSection />

      <Pressable
        onPress={signOut}
        style={{
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
          borderRadius: 10, padding: 16, alignItems: "center",
        }}
      >
        <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
    </ScrollView>
  );
}
