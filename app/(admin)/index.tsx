// Platform admin — lista firmi (metapodaci + brojke). Pristup kroz admin RPC-ove;
// poslovni sadržaj firmi (ture/troškovi/finansije) je NEDOSTUPAN adminu (RLS + 0014).
import { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { fmtDate } from "../../src/lib/format";
import { adminListCompanies, type AdminCompany } from "../../src/features/admin/api";
import { isPastDue, limitState, platformTotals } from "../../src/features/admin/adminMath";
import { CompanyDetailModal } from "../../src/features/admin/CompanyDetailModal";

const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function AdminHome() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AdminCompany | null>(null);

  const q = useQuery({ queryKey: ["admin-companies"], queryFn: adminListCompanies });
  const rows = q.data ?? [];
  const totals = platformTotals(rows);
  const today = todayYMD();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textMuted }}>
                {t("admin.totals", { companies: totals.companies, vehicles: totals.vehicles, drivers: totals.drivers })}
              </Text>
            </View>
          }
          ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 24 }}>{t("admin.empty")}</Text>}
          renderItem={({ item }) => (
            <CompanyRow company={item} today={today} colors={colors} onPress={() => setSelected(item)} />
          )}
        />
      )}

      {selected && (
        <CompanyDetailModal company={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

function CompanyRow({ company: c, today, colors, onPress }: { company: AdminCompany; today: string; colors: Palette; onPress: () => void }) {
  const { t } = useTranslation();
  const suspended = c.status === "suspended";
  const past = isPastDue(c.paid_until, today);
  const lim = limitState(c.vehicles_used, c.vehicle_limit);

  return (
    <Pressable onPress={onPress} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: colors.text, fontWeight: "700" }}>{c.name}</Text>
        <Badge label={t(`admin.status.${c.status}`)} color={suspended ? colors.danger : colors.primary} colors={colors} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>
        {c.plan} · {t("plan.vehicles", { used: c.vehicles_used, limit: c.vehicle_limit })}
        {lim !== "ok" ? `  · ${t(lim === "over" ? "admin.overLimit" : "admin.atLimit")}` : ""}
      </Text>
      {c.owner_emails ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.owner_emails}</Text> : null}
      {c.paid_until ? (
        <Text style={{ color: past ? colors.danger : colors.textMuted, fontSize: 12 }}>
          {t("admin.paidUntil")}: {fmtDate(c.paid_until)}{past ? `  (${t("admin.pastDue")})` : ""}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Badge({ label, color, colors }: { label: string; color: string; colors: Palette }) {
  return (
    <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: color, backgroundColor: colors.bg }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
