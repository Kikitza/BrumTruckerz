// Vozačev mali „Profil": ime, BT-D broj i trenutni telefon (maskiran) + „Promeni broj".
// Dokaz kapije: promena broja NE dira identitet (BT-D/zaposlenje/ture) — v. IZVESTAJ.
// Boje iz tokena (pravilo #8), stringovi kroz t() (pravilo #7); pristup bazi kroz api sloj.
import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Screen } from "../../src/components/Screen";
import { useTheme } from "../../src/lib/theme";
import { useSignOut } from "../../src/features/auth/signOut";
import { getMyProfile } from "../../src/features/identity/api";
import { PhoneChange } from "../../src/features/identity/PhoneChange";
import { maskPhone } from "../../src/features/auth/phone";
import { CareerProfileView } from "../../src/features/career/CareerProfileView";
import { NetworkProfileEditor } from "../../src/features/network/NetworkProfileEditor";
import { NetworkInvites } from "../../src/features/network/NetworkInvites";

export default function DriverProfile() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const [changing, setChanging] = useState(false);

  const q = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile });

  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text selectable style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>{value}</Text>
    </View>
  );

  return (
    <Screen top={false}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 14 }}>
          <Row label={t("profile.name")} value={q.data?.name ?? "—"} />
          <Row label={t("profile.publicNo")} value={q.data?.public_no ?? "—"} />
          <Row label={t("profile.phone")} value={maskPhone(q.data?.phone)} />

          {changing ? (
            <View style={{ gap: 10, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14 }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{t("profile.changePhone")}</Text>
              <PhoneChange
                onChanged={() => {
                  qc.invalidateQueries({ queryKey: ["my-profile"] });
                  setChanging(false);
                }}
              />
              <Pressable onPress={() => setChanging(false)} hitSlop={8} style={{ alignItems: "center", padding: 8 }}>
                <Text style={{ color: colors.textMuted }}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setChanging(true)}
              style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}
            >
              <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("profile.changePhone")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Karijerni CV (self): zbirne brojke, grafikon km/mesec, istorija zaposlenja */}
      <CareerProfileView showHeader={false} />

      {/* Mrežni profil (ADR 0014): vidljivost tržištu (opt-in) + pozivi firmi */}
      <NetworkInvites />
      <NetworkProfileEditor />

      <Pressable
        onPress={signOut}
        style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, alignItems: "center" }}
      >
        <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("settings.signOut")}</Text>
      </Pressable>
      </ScrollView>
    </Screen>
  );
}
