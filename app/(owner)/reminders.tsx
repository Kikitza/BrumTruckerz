// Ekran "Rokovi" (vlasnik): svi datumski rokovi firme grupisani po hitnosti —
// isteklo (crveno) / ≤30 dana (žuto) / ostalo. Sortirano po due_date.
// Pristup bazi ISKLJUČIVO kroz src/features/reminders/api.ts; boje iz tokena; stringovi kroz t().
import { View, Text, SectionList, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { fmtDate } from "../../src/lib/format";
import { listAllReminders, type ReminderRow } from "../../src/features/reminders/api";

const DAY_MS = 86_400_000;

// Broj dana od danas (lokalna ponoć) do due_date; <0 = isteklo, 0 = danas.
function daysUntil(ymd: string): number {
  const due = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

type Bucket = "expired" | "soon" | "other";
function bucketOf(days: number): Bucket {
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "other";
}

export default function RemindersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const q = useQuery({ queryKey: ["reminders", "all"], queryFn: listAllReminders });

  const rows = q.data ?? [];
  const groups: Record<Bucket, ReminderRow[]> = { expired: [], soon: [], other: [] };
  for (const r of rows) {
    if (!r.due_date) continue;
    groups[bucketOf(daysUntil(r.due_date))].push(r);
  }

  const order: Bucket[] = ["expired", "soon", "other"];
  const sections = order
    .map((b) => ({ bucket: b, data: groups[b] }))
    .filter((s) => s.data.length > 0);

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 40 }}>
            {t("reminders.empty")}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              color: colors.textMuted, fontWeight: "700", fontSize: 13,
              paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8,
            }}
          >
            {t(`reminders.group.${(section as { bucket: Bucket }).bucket}`)}
          </Text>
        )}
        renderItem={({ item }) => <ReminderRowView colors={colors} row={item} />}
      />
    </View>
  );
}

function accentFor(days: number, colors: Palette): string {
  if (days < 0) return colors.danger;
  if (days <= 30) return colors.warn;
  return colors.border;
}

function ReminderRowView({ colors, row }: { colors: Palette; row: ReminderRow }) {
  const { t } = useTranslation();
  const days = row.due_date ? daysUntil(row.due_date) : 0;
  const accent = accentFor(days, colors);
  const catLabel =
    row.category === "custom"
      ? row.label?.trim() || t("reminders.category.custom")
      : t(`reminders.category.${row.category}`);
  const when =
    days < 0
      ? t("reminders.overdue", { count: Math.abs(days) })
      : days === 0
        ? t("reminders.today")
        : t("reminders.inDays", { count: days });

  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        marginHorizontal: 12, marginVertical: 4, padding: 14,
        borderRadius: 10, backgroundColor: colors.surface,
        borderWidth: 1, borderColor: colors.border,
        borderLeftWidth: 4, borderLeftColor: accent,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>
          {t(`reminders.subject.${row.subject_type}`)}: {row.subject_name}
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 13 }}>{catLabel}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>
          {row.due_date ? fmtDate(row.due_date) : "—"}
        </Text>
        <Text style={{ color: days <= 30 ? accent : colors.textMuted, marginTop: 2, fontSize: 12 }}>
          {when}
        </Text>
      </View>
    </View>
  );
}
