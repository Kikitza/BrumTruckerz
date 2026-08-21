// Ekran "Rokovi" (kancelarija): rokovi firme grupisani po SUBJEKTU (Vozila/Prikolice/Vozači).
// Zaglavlje nosi semafor-sažetak (crveno / žuto / ukupno). Red subjekta = bedž NAJGOREG statusa
// (date + km zajedno). Tap otvara modal sa svim rokovima subjekta + „Novi rok" (izbor tipa iz
// šifarnika) i „Izmeni" (može promeniti tip/režim). Km-rokovi prikazuju „još X km".
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { Collapsible } from "../../src/components/Collapsible";
import { DesktopContainer } from "../../src/components/DesktopContainer";
import { ModalScaffold } from "../../src/components/form";
import { fmtDate } from "../../src/lib/format";
import { listAllReminders, type ReminderRow, type ReminderSubjectType } from "../../src/features/reminders/api";
import { ReminderFormModal } from "../../src/features/reminders/ReminderFormModal";
import { kmStatus, kmRemaining, dateSeverity, worstSeverity, SEVERITY_RANK, type Severity } from "../../src/features/reminders/status";

const DAY_MS = 86_400_000;
const SUBJECTS: ReminderSubjectType[] = ["vehicle", "trailer", "driver"];

function daysUntil(ymd: string): number {
  const due = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

// Status jednog roka: km-rok iz kilometraže, datumski iz dana.
function rowSeverity(r: ReminderRow): Severity {
  if (r.mode === "km") return kmStatus(r.subject_odometer, r.due_km) ?? "ok";
  return r.due_date ? dateSeverity(daysUntil(r.due_date)) : "ok";
}
function sevColor(s: Severity, c: Palette): string {
  return s === "red" ? c.danger : s === "yellow" ? c.warn : c.border;
}
// Ključ za sortiranje (hitniji prvi): datum kao dani, km kao „ekvivalent dana" (grubo, samo za red).
function sortKey(r: ReminderRow): number {
  if (r.mode === "km") { const rem = kmRemaining(r.subject_odometer, r.due_km); return rem == null ? 1e9 : rem; }
  return r.due_date ? daysUntil(r.due_date) : 1e9;
}

function catLabel(r: ReminderRow, t: (k: string) => string): string {
  const base = r.type_name_key
    ? t(r.type_name_key)
    : r.category === "custom"
      ? (r.label?.trim() || t("reminders.category.custom"))
      : t(`reminders.category.${r.category}`);
  return r.country_code ? `${base} (${r.country_code})` : base;
}
function whenLabel(r: ReminderRow, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (r.mode === "km") {
    const rem = kmRemaining(r.subject_odometer, r.due_km);
    if (rem == null) return "—";
    return rem < 0 ? t("reminders.km.over", { count: Math.abs(rem) }) : t("reminders.km.remaining", { count: rem });
  }
  const d = r.due_date ? daysUntil(r.due_date) : 0;
  return d < 0 ? t("reminders.overdue", { count: Math.abs(d) }) : d === 0 ? t("reminders.today") : t("reminders.inDays", { count: d });
}

type SubjectGroup = { id: string; name: string; type: ReminderSubjectType; odometer: number | null; reminders: ReminderRow[]; worst: Severity };

function groupBySubject(items: ReminderRow[]): SubjectGroup[] {
  const byId = new Map<string, ReminderRow[]>();
  for (const r of items) { const a = byId.get(r.subject_id) ?? []; a.push(r); byId.set(r.subject_id, a); }
  const groups: SubjectGroup[] = [];
  for (const [id, rs] of byId) {
    const sorted = [...rs].sort((a, b) => sortKey(a) - sortKey(b));
    const worst = worstSeverity(sorted.map(rowSeverity));
    groups.push({ id, name: sorted[0].subject_name, type: sorted[0].subject_type, odometer: sorted[0].subject_odometer, reminders: sorted, worst });
  }
  groups.sort((a, b) => SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst] || (a.name < b.name ? -1 : 1));
  return groups;
}

type Summary = { expired: number; soon: number; total: number };
function summarize(items: ReminderRow[]): Summary {
  let expired = 0, soon = 0;
  for (const r of items) { const s = rowSeverity(r); if (s === "red") expired++; else if (s === "yellow") soon++; }
  return { expired, soon, total: items.length };
}

export default function RemindersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["reminders", "all"], queryFn: listAllReminders });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = q.data ?? [];
  const groups: Record<ReminderSubjectType, ReminderRow[]> = { vehicle: [], trailer: [], driver: [] };
  for (const r of rows) groups[r.subject_type].push(r);
  const subjectGroups: Record<ReminderSubjectType, SubjectGroup[]> = {
    vehicle: groupBySubject(groups.vehicle), trailer: groupBySubject(groups.trailer), driver: groupBySubject(groups.driver),
  };
  const selected = selectedId
    ? [...subjectGroups.vehicle, ...subjectGroups.trailer, ...subjectGroups.driver].find((g) => g.id === selectedId) ?? null
    : null;

  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;

  if (rows.length === 0) {
    return (
      <DesktopContainer maxWidth={900}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}>
          <Text style={{ textAlign: "center", color: colors.textMuted }}>{t("reminders.empty")}</Text>
        </ScrollView>
      </DesktopContainer>
    );
  }

  return (
    <DesktopContainer maxWidth={900}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}>
        {SUBJECTS.map((subject) => {
          const summary = summarize(groups[subject]);
          const subjects = subjectGroups[subject];
          const title = t(`reminders.groupSubject.${subject}`);
          return (
            <Collapsible key={subject} colors={colors} title={title} defaultOpen={summary.expired > 0}
              accessibilityLabel={`${title}. ${t("reminders.summaryA11y", summary)}`}
              right={<Semaphore colors={colors} summary={summary} />}>
              {subjects.length === 0 ? (
                <Text style={{ color: colors.textMuted, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 }}>{t("reminders.sectionEmpty")}</Text>
              ) : (
                subjects.map((g) => <SubjectRow key={g.id} group={g} colors={colors} t={t} onPress={() => setSelectedId(g.id)} />)
              )}
            </Collapsible>
          );
        })}
      </ScrollView>

      {selected && <SubjectRemindersModal group={selected} colors={colors} onClose={() => setSelectedId(null)} />}
    </DesktopContainer>
  );
}

function SubjectRow({ group, colors, t, onPress }: { group: SubjectGroup; colors: Palette; t: (k: string, o?: Record<string, unknown>) => string; onPress: () => void }) {
  const urgent = group.worst !== "ok";
  const color = urgent ? sevColor(group.worst, colors) : colors.textMuted;
  const head = group.reminders[0];
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginVertical: 4, padding: 14,
        borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: urgent ? color : colors.border }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>{group.name}</Text>
      <Text style={{ color, fontWeight: "600", fontSize: 13 }}>{whenLabel(head, t)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

function SubjectRemindersModal({ group, colors, onClose }: { group: SubjectGroup; colors: Palette; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<{ open: boolean; row: ReminderRow | null }>({ open: false, row: null });
  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.done")}</Text></Pressable>
        <Text style={{ flex: 1, textAlign: "center", color: colors.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>{group.name}</Text>
        <Pressable onPress={() => setForm({ open: true, row: null })} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>{t("reminders.add")}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
        {group.reminders.map((r) => (
          <ReminderRowView key={r.id} colors={colors} row={r} onPress={() => setForm({ open: true, row: r })} />
        ))}
      </ScrollView>
      {form.open && (
        <ReminderFormModal
          subjectType={group.type} subjectId={group.id} subjectOdometer={group.odometer}
          row={form.row} onClose={() => setForm({ open: false, row: null })}
        />
      )}
    </ModalScaffold>
  );
}

function Semaphore({ colors, summary }: { colors: Palette; summary: Summary }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Count colors={colors} n={summary.expired} color={colors.danger} />
      <Count colors={colors} n={summary.soon} color={colors.warn} />
      <View style={{ minWidth: 26, alignItems: "center", paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{summary.total}</Text>
      </View>
    </View>
  );
}

function Count({ colors, n, color }: { colors: Palette; n: number; color: string }) {
  const active = n > 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: active ? 1 : 0.35 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: active ? color : colors.textMuted }} />
      <Text style={{ color: active ? color : colors.textMuted, fontWeight: "700", fontSize: 13, minWidth: 12 }}>{n}</Text>
    </View>
  );
}

function ReminderRowView({ colors, row, onPress }: { colors: Palette; row: ReminderRow; onPress: () => void }) {
  const { t } = useTranslation();
  const sev = rowSeverity(row);
  const accent = sevColor(sev, colors);
  return (
    <Pressable onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginVertical: 4, padding: 14,
        borderRadius: 10, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: accent }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{catLabel(row, t)}</Text>
        <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 13 }}>
          {row.mode === "km" ? t("reminders.mode.km") : row.due_date ? fmtDate(row.due_date) : "—"}
        </Text>
      </View>
      <Text style={{ color: sev === "ok" ? colors.textMuted : accent, fontWeight: "600", fontSize: 12 }}>{whenLabel(row, t)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}
