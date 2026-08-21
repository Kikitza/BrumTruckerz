// Podešavanja (vlasnik/dispečer): paket + iskorišćenost vozila, podaci izdavaoca, pozivnice, odjava.
import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSignOut } from "../../src/features/auth/signOut";
import { useTheme } from "../../src/lib/theme";
import { DesktopContainer } from "../../src/components/DesktopContainer";
import { getCompanyPlan, countVehicles } from "../../src/features/fleet/api";
import { InvitesSection } from "../../src/features/identity/InvitesSection";
import { InvoiceSettingsModal } from "../../src/features/invoices/InvoiceSettingsModal";
import { useRole } from "../../src/features/auth/useRole";
import { CareerProfileModal } from "../../src/features/career/CareerProfileModal";

export default function Settings() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const signOut = useSignOut();
  const { isOwner, role } = useRole();
  const [invoiceSettings, setInvoiceSettings] = useState(false);
  const [myCv, setMyCv] = useState(false);

  // Paket + iskorišćenost čita samo vlasnik (dispečer nema „Paket": owner-only).
  const planQ = useQuery({ queryKey: ["company-plan"], queryFn: getCompanyPlan, enabled: isOwner });
  const vehCountQ = useQuery({ queryKey: ["vehicle-count"], queryFn: countVehicles, enabled: isOwner });

  return (
    <DesktopContainer maxWidth={720}>
     <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      {/* Paket firme (menja samo platforma) — OWNER-only (matrica: paket/podešavanja firme) */}
      {isOwner && (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{t("plan.title")}</Text>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{planQ.data?.plan ?? "—"}</Text>
          {planQ.data && (
            <Text style={{ color: colors.textMuted }}>
              {t("plan.vehicles", { used: vehCountQ.data ?? 0, limit: planQ.data.vehicle_limit })}
            </Text>
          )}
        </View>
      )}

      {/* Podaci izdavaoca (za fakture) — office */}
      <Pressable
        onPress={() => setInvoiceSettings(true)}
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16 }}
      >
        <Text style={{ color: colors.text, fontWeight: "600" }}>{t("invoice.settings.title")}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{t("invoice.settings.hint")}</Text>
      </Pressable>

      {/* Dispečer: sopstveni karijerni CV (vlasnik nije radnik-građanin, pa mu se ne nudi). */}
      {role === "dispatcher" && (
        <Pressable
          onPress={() => setMyCv(true)}
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16 }}
        >
          <Text style={{ color: colors.text, fontWeight: "600" }}>{t("career.myCv")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{t("career.myCvHint")}</Text>
        </Pressable>
      )}

      {/* Pozivnice: dispečer vidi/pravi SAMO vozačke (allowDispatcher=false) */}
      <InvitesSection allowDispatcher={isOwner} />

      {invoiceSettings && <InvoiceSettingsModal onClose={() => setInvoiceSettings(false)} />}
      {myCv && <CareerProfileModal userId={null} onClose={() => setMyCv(false)} />}

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
    </DesktopContainer>
  );
}
