// Ekran "Rokovi" (vlasnik): rokovi firme grupisani po SUBJEKTU —
// tri sklopive sekcije (Vozila / Prikolice / Vozači). Zaglavlje UVEK nosi
// semafor-sažetak (isteklo / ≤30 dana / ukupno) da radi kao alarm-tabla na prvi pogled.
// Red subjekta je MINIMALAN (ime + bedž najgoreg statusa + najbliži datum); tap
// OTVARA zaseban modal sa SVIM rokovima tog subjekta (reusable, isti za sve kategorije).
// Grupisanje je na klijentu iz listAllReminders (bez izmena api/baze). Boje iz tokena; stringovi kroz t().
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { Collapsible } from "../../src/components/Collapsible";
import { ModalScaffold } from "../../src/components/form";
import { fmtDate } from "../../src/lib/format";
import { listAllReminders, type ReminderRow, type ReminderSubjectType } from "../../src/features/reminders/api";

const DAY_MS = 86_400_000;
const SUBJECTS: ReminderSubjectType[] = ["vehicle", "trailer", "driver"];

// Broj dana od danas (lokalna ponoć) do due_date; <0 = isteklo, 0 = danas.
function daysUntil(ymd: string): number {
  const due = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

// ── Status (kanta) hitnosti ──
type Bucket = "expired" | "soon" | "ok";
const BUCKET_RANK: Record<Bucket, number> = { expired: 0, soon: 1, ok: 2 };
function bucketOf(days: number): Bucket {
  return days < 0 ? "expired" : days <= 30 ? "soon" : "ok";
}
function bucketColor(b: Bucket, colors: Palette): string {
  return b === "expired" ? colors.danger : b === "soon" ? colors.warn : colors.border;
}

// Sažetak jedne sekcije za semafor u zaglavlju.
type Summary = { expired: number; soon: number; total: number };
function summarize(items: ReminderRow[]): Summary {
  let expired = 0;
  let soon = 0;
  for (const r of items) {
    const d = daysUntil(r.due_date as string);
    if (d < 0) expired++;
    else if (d <= 30) soon++;
  }
  return { expired, soon, total: items.length };
}

// Subjekat sa svim svojim rokovima + izvedeni najgori status i najbliži datum.
type SubjectGroup = {
  id: string;
  name: string;
  reminders: ReminderRow[]; // sortirano po datumu (rastuće)
  worst: Bucket;
  nearest: string; // najbliži (najmanji) due_date
};

// Grupiši rokove jedne kategorije po subjektu; sortiraj subjekte: najgori prvo, pa najbliži datum.
function groupBySubject(items: ReminderRow[]): SubjectGroup[] {
  const byId = new Map<string, ReminderRow[]>();
  for (const r of items) {
    const arr = byId.get(r.subject_id) ?? [];
    arr.push(r);
    byId.set(r.subject_id, arr);
  }
  const groups: SubjectGroup[] = [];
  for (const [id, rs] of byId) {
    const sorted = [...rs].sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0));
    let worst: Bucket = "ok";
    for (const r of sorted) {
      const b = bucketOf(daysUntil(r.due_date!));
      if (BUCKET_RANK[b] < BUCKET_RANK[worst]) worst = b;
    }
    groups.push({ id, name: sorted[0].subject_name, reminders: sorted, worst, nearest: sorted[0].due_date! });
  }
  groups.sort((a, b) => BUCKET_RANK[a.worst] - BUCKET_RANK[b.worst] || (a.nearest < b.nearest ? -1 : a.nearest > b.nearest ? 1 : 0));
  return groups;
}

export default function RemindersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["reminders", "all"], queryFn: listAllReminders });

  // Otvoreni subjekat (modal) — čuvamo id, sadržaj se izvodi iz svežih podataka.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = q.data ?? [];
  const groups: Record<ReminderSubjectType, ReminderRow[]> = { vehicle: [], trailer: [], driver: [] };
  for (const r of rows) {
    if (!r.due_date) continue;
    groups[r.subject_type].push(r);
  }
  const subjectGroups: Record<ReminderSubjectType, SubjectGroup[]> = {
    vehicle: groupBySubject(groups.vehicle),
    trailer: groupBySubject(groups.trailer),
    driver: groupBySubject(groups.driver),
  };
  const selected = selectedId
    ? [...subjectGroups.vehicle, ...subjectGroups.trailer, ...subjectGroups.driver].find((g) => g.id === selectedId) ?? null
    : null;

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}
        >
          <Text style={{ textAlign: "center", color: colors.textMuted }}>{t("reminders.empty")}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 10 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.primary} />}
      >
        {SUBJECTS.map((subject) => {
          const summary = summarize(groups[subject]);
          const subjects = subjectGroups[subject];
          const title = t(`reminders.groupSubject.${subject}`);
          return (
            <Collapsible
              key={subject}
              colors={colors}
              title={title}
              defaultOpen={summary.expired > 0} // istekli -> auto-otvoreno
              accessibilityLabel={`${title}. ${t("reminders.summaryA11y", summary)}`}
              right={<Semaphore colors={colors} summary={summary} />}
            >
              {subjects.length === 0 ? (
                <Text style={{ color: colors.textMuted, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13 }}>
                  {t("reminders.sectionEmpty")}
                </Text>
              ) : (
                subjects.map((g) => <SubjectRow key={g.id} group={g} colors={colors} onPress={() => setSelectedId(g.id)} />)
              )}
            </Collapsible>
          );
        })}
      </ScrollView>

      {selected && (
        <SubjectRemindersModal name={selected.name} reminders={selected.reminders} colors={colors} onClose={() => setSelectedId(null)} />
      )}
    </View>
  );
}

// Minimalan red subjekta: bedž najgoreg statusa + ime + najbliži datum + chevron.
function SubjectRow({ group, colors, onPress }: { group: SubjectGroup; colors: Palette; onPress: () => void }) {
  const urgent = group.worst !== "ok";
  const color = urgent ? bucketColor(group.worst, colors) : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        marginHorizontal: 12, marginVertical: 4, padding: 14,
        borderRadius: 10, backgroundColor: colors.bg,
        borderWidth: 1, borderColor: colors.border,
        borderLeftWidth: 4, borderLeftColor: urgent ? color : colors.border,
      }}
    >
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ flex: 1, color: colors.text, fontWeight: "600" }}>{group.name}</Text>
      <Text style={{ color, fontWeight: "600" }}>{fmtDate(group.nearest)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

// Zaseban prikaz subjekta (reusable za sve tri kategorije): naslov = ime, ispod svi rokovi.
function SubjectRemindersModal({
  name, reminders, colors, onClose,
}: { name: string; reminders: ReminderRow[]; colors: Palette; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", color: colors.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>{name}</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 32 }}>
        {reminders.map((r) => <ReminderRowView key={r.id} colors={colors} row={r} />)}
      </ScrollView>
    </ModalScaffold>
  );
}

// Tri broja: isteklo (crveno), ≤30 dana (žuto), ukupno (neutralno). Nula = prigušeno.
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
        borderRadius: 10, backgroundColor: colors.bg,
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
