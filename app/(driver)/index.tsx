// Aktivna tura (vozač): status dugmad + troškovi -> SVE kroz offline red (radi bez mreže).
// Vozač SAMO dodaje troškove (izmenu/brisanje radi vlasnik) — svesna odluka za MVP.
// Pristup bazi kroz feature api sloj; boje iz tokena; stringovi kroz t().
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { driverListTrips, driverAddEvent, driverProgress, listTripStops } from "../../src/features/trips/api";
import { RouteView } from "../../src/features/trips/stops";
import {
  listTripExpenses, listPendingExpenses, addExpense, getCompanyBaseCurrency,
} from "../../src/features/expenses/api";
import { ExpenseForm, type ExpenseFormValues } from "../../src/features/expenses/ExpenseForm";
import { AttachmentsSection } from "../../src/features/attachments/AttachmentsSection";
import { expenseAttachmentKind } from "../../src/features/attachments/api";
import { useSignOut } from "../../src/features/auth/signOut";
import { pendingCount } from "../../src/lib/offline/queue";
import { useTheme, type Palette } from "../../src/lib/theme";
import { fmtDate, fmtMoney } from "../../src/lib/format";

const STATUSES = ["loading", "driving", "border", "unloading", "finished"] as const;
type Status = (typeof STATUSES)[number];
// Status -> tip događaja koji se beleži u dnevnik (denormalizacija statusa ostaje na RPC-u).
const STATUS_TO_EVENT: Record<Status, string> = {
  loading: "load", driving: "driving", border: "border", unloading: "unload", finished: "other",
};

export default function DriverHome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const { data } = useQuery({ queryKey: ["driver-trips"], queryFn: driverListTrips });
  const active = data?.find((x: any) => x.status !== "finished");
  // Stanice ture (read-only za vozača; RLS: SELECT samo za svoje ture). km unosi stižu kasnije.
  const stopsQ = useQuery({
    queryKey: ["driver-trip-stops", active?.id],
    queryFn: () => listTripStops(active!.id),
    enabled: !!active,
  });

  const setStatus = async (s: Status) => {
    if (!active) return;
    await driverAddEvent({ company_id: active.company_id, trip_id: active.id, type: STATUS_TO_EVENT[s] });
    await driverProgress({ trip_id: active.id, status: s });
    qc.invalidateQueries({ queryKey: ["pending-count"] });
  };

  if (!active) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 20, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.textMuted }}>—</Text>
        <SignOutButton colors={colors} onPress={signOut} label={t("settings.signOut")} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>
          {active.title ?? active.id.slice(0, 8)}
        </Text>
        <Text style={{ color: colors.textMuted }}>{String(t(`trip.status.${active.status}`, active.status))}</Text>
      </View>

      {(stopsQ.data?.length ?? 0) > 0 && (
        <View style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <RouteView origin={null} destination={null} stops={stopsQ.data ?? []} colors={colors} />
        </View>
      )}

      <PendingBanner colors={colors} />

      <View style={{ gap: 8 }}>
        {STATUSES.map((s) => {
          const on = s === active.status;
          return (
            <Pressable key={s} onPress={() => setStatus(s)}
              style={{
                padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
                backgroundColor: on ? colors.primary : colors.surface,
              }}>
              <Text style={{ color: on ? colors.onPrimary : colors.text }}>{t(`trip.status.${s}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("common.offlineNote")}</Text>

      {/* Dokumenti ture (CMR/faktura/carina…) — vozač samo dodaje */}
      <View style={{ gap: 8 }}>
        <SectionLabel text={t("attachment.documents")} colors={colors} />
        <AttachmentsSection tripId={active.id} pickKind canDelete colors={colors} />
      </View>

      <DriverExpenses tripId={active.id} companyId={active.company_id} colors={colors} />

      <SignOutButton colors={colors} onPress={signOut} label={t("settings.signOut")} />
    </ScrollView>
  );
}

// Dugme „Odjava" (isti izgled/logika kao vlasnički Settings; koristi deljeni useSignOut).
function SignOutButton({ colors, onPress, label }: { colors: Palette; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
        borderRadius: 10, padding: 16, alignItems: "center",
      }}
    >
      <Text style={{ color: colors.danger, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

// Banner: broj SVIH radnji koje čekaju u redu (status, događaji, troškovi). Nestaje na 0.
function PendingBanner({ colors }: { colors: Palette }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["pending-count"],
    queryFn: () => pendingCount(),
    refetchInterval: (query) => ((query.state.data ?? 0) > 0 ? 3000 : false),
  });
  const n = q.data ?? 0;
  if (n === 0) return null;
  return (
    <View style={{ padding: 10, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warn }}>
      <Text style={{ color: colors.warn, fontWeight: "600" }}>{t("trip.pendingSync", { count: n })}</Text>
    </View>
  );
}

// Naslov sekcije (isti stil na vozačevom ekranu).
function SectionLabel({ text, colors }: { text: string; colors: Palette }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{text}</Text>;
}

// Troškovi ture: sinhronizovani (baza, RLS = svoje ture) + lokalni koji čekaju u redu.
function DriverExpenses({ tripId, companyId, colors }: { tripId: string; companyId: string; colors: Palette }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Bazna valuta firme: povučena/keširana dok ima mreže; offline se koristi keš (fallback EUR).
  const baseQ = useQuery({ queryKey: ["company-base-currency"], queryFn: getCompanyBaseCurrency, staleTime: Infinity });
  const baseCurrency = baseQ.data ?? "EUR";

  // Sinhronizovani + pending u jednom upitu; poll dok god ima stavki koje čekaju.
  const listQ = useQuery({
    queryKey: ["driver-expenses", tripId],
    queryFn: async () => ({
      synced: await listTripExpenses(tripId),
      pending: await listPendingExpenses(tripId),
    }),
    refetchInterval: (query) => ((query.state.data?.pending.length ?? 0) > 0 ? 3000 : false),
  });
  const synced = listQ.data?.synced ?? [];
  const pending = listQ.data?.pending ?? [];

  const submit = async (v: ExpenseFormValues) => {
    try {
      // Vozač NE računa kurs lokalno — original ide u red, base_amount se rešava pri sinhr.
      await addExpense({
        company_id: companyId,
        trip_id: tripId,
        base_currency: baseCurrency,
        category: v.category,
        original_amount: v.original_amount,
        original_currency: v.original_currency,
        occurred_at: v.occurred_at,
        liters: v.liters ?? undefined,
        country: v.country ?? undefined,
        note: v.note ?? undefined,
      });
      qc.invalidateQueries({ queryKey: ["driver-expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
    } catch (e) {
      Alert.alert(t("common.error"), String((e as Error).message ?? e));
      throw e;
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionLabel text={t("expense.section")} colors={colors} />

      {synced.length === 0 && pending.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>{t("expense.empty")}</Text>
      ) : (
        <>
          {/* Pending: samo original (bez lokalnog preračuna u baznu valutu) + bedž */}
          {pending.map((e) => (
            <View key={`p-${e.queueId}`} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warn, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`expense.categories.${e.category}`)}</Text>
                <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.warn }}>
                  <Text style={{ color: colors.onPrimary, fontSize: 11, fontWeight: "700" }}>{t("expense.pending")}</Text>
                </View>
              </View>
              <Text style={{ color: colors.textMuted }}>{fmtMoney(e.original_amount, e.original_currency)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {fmtDate(e.occurred_at)}{e.country ? ` · ${e.country}` : ""}{e.liters != null ? ` · ${e.liters} L` : ""}
              </Text>
              {e.note ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{e.note}</Text> : null}
              <AttachmentsSection expenseId={e.id} tripId={tripId} kind={expenseAttachmentKind(e.category)}
                canDelete colors={colors} />
            </View>
          ))}
          {/* Sinhronizovani: original + iznos u baznoj valuti */}
          {synced.map((e) => (
            <View key={e.id} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`expense.categories.${e.category}`)}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textMuted }}>{fmtMoney(e.original_amount, e.original_currency)}</Text>
                <Text style={{ color: colors.text }}>{fmtMoney(e.base_amount, e.base_currency)}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {fmtDate(e.occurred_at)}{e.country ? ` · ${e.country}` : ""}{e.liters != null ? ` · ${e.liters} L` : ""}
              </Text>
              {e.note ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{e.note}</Text> : null}
              <AttachmentsSection expenseId={e.id} tripId={tripId} kind={expenseAttachmentKind(e.category)}
                canDelete colors={colors} />
            </View>
          ))}
        </>
      )}

      <ExpenseForm colors={colors} onSubmit={submit} />
    </View>
  );
}
