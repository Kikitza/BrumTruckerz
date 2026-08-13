// Modal „Detalj ture" (vlasnik): podaci + finansije + troškovi + dnevnik događaja.
// Izdvojeno iz ekrana tura (app/(owner)/trips/index.tsx) — čisto premeštanje, bez promene logike.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { fmtDateTime, fmtDate, fmtMoney } from "../../lib/format";
import { Field, ModalScaffold } from "../../components/form";
import { toNum } from "../../lib/num";
import {
  ownerGetTrip, ownerUpdateTripFinance, ownerListTripEvents, ownerAddTripEvent, tripTitle,
  type EventType, type DriverPayMode,
} from "./api";
import { listTripExpenses, ownerAddExpense, ownerDeleteExpense } from "../expenses/api";
import { ExpenseForm, type ExpenseFormValues } from "../expenses/ExpenseForm";

const EVENT_TYPES: EventType[] = ["load", "unload", "border", "driving", "rest", "other"];
const PAY_MODES: DriverPayMode[] = ["per_diem", "percentage", "fixed"];

// ── Pomoćni parseri za datum-vreme događaja ──
const pad = (n: number) => String(n).padStart(2, "0");
const nowLocalInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// "YYYY-MM-DD HH:mm" (lokalno) -> ISO; nevalidno -> null (pozivalac uzima now()).
const parseLocalDateTime = (s: string): string | null => {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

export function TripDetailModal({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => ownerGetTrip(tripId) });
  const events = useQuery({ queryKey: ["trip-events", tripId], queryFn: () => ownerListTripEvents(tripId) });

  // Finansije (init iz učitane ture)
  const [revenue, setRevenue] = useState("");
  const [payMode, setPayMode] = useState<DriverPayMode | null>(null);
  const [driverPay, setDriverPay] = useState("");
  useEffect(() => {
    const d = trip.data;
    if (!d) return;
    setRevenue(d.revenue != null ? String(d.revenue) : "");
    setPayMode(d.driver_pay_mode ?? null);
    setDriverPay(d.driver_pay != null ? String(d.driver_pay) : "");
  }, [trip.data?.id]);

  const saveFinance = useMutation({
    mutationFn: () =>
      ownerUpdateTripFinance(tripId, {
        revenue: toNum(revenue),
        driver_pay_mode: payMode,
        driver_pay: toNum(driverPay),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", tripId] }),
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  // Dodavanje događaja
  const [eventType, setEventType] = useState<EventType>("load");
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  const addEvent = useMutation({
    mutationFn: () =>
      ownerAddTripEvent({
        trip_id: tripId,
        type: eventType,
        occurred_at: parseLocalDateTime(occurredAt) ?? new Date().toISOString(),
        location: location.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip-events", tripId] });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["owner-trips"] });
      setLocation("");
      setNote("");
      setOccurredAt(nowLocalInput());
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  // ── Troškovi (owner online; kurs za datum troška, base_amount računa kod) ──
  const expenses = useQuery({ queryKey: ["trip-expenses", tripId], queryFn: () => listTripExpenses(tripId) });

  // Unos ide kroz deljenu ExpenseForm; na grešku prikaži Alert i re-throw (forma zadrži unos).
  const submitExpense = async (v: ExpenseFormValues) => {
    try {
      await ownerAddExpense({ trip_id: tripId, ...v });
      // P&L (trip_pnl) i zbir zavise od troškova -> osveži i turu
      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    } catch (e) {
      Alert.alert(t("common.error"), String((e as Error).message ?? e));
      throw e;
    }
  };

  const delExpense = useMutation({
    mutationFn: (id: string) => ownerDeleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });
  const confirmDeleteExpense = (id: string) =>
    Alert.alert(t("expense.deleteConfirm"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => delExpense.mutate(id) },
    ]);

  const expenseRows = expenses.data ?? [];
  const baseCurrency = expenseRows[0]?.base_currency ?? "EUR";
  const expensesTotal = expenseRows.reduce((s, e) => s + (e.base_amount ?? 0), 0);

  const d = trip.data;

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View
        style={{
          flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          padding: 16, borderBottomWidth: 1, borderColor: colors.border,
        }}
      >
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("trip.detailTitle")}</Text>
        <View style={{ width: 48 }} />
      </View>

      {trip.isLoading || !d ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {/* Podaci */}
            <View style={{ gap: 6 }}>
              <SectionTitle text={t("trip.section.info")} colors={colors} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 18 }}>
                {tripTitle(d.origin, d.destination) ?? d.title ?? d.id.slice(0, 8)}
              </Text>
              <View style={{ alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 4 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`trip.status.${d.status}`)}</Text>
              </View>
              <KV label={t("trip.fields.driver")} value={d.driver?.full_name ?? "—"} colors={colors} />
              <KV label={t("trip.fields.vehicle")} value={d.vehicle?.registration ?? "—"} colors={colors} />
              <KV label={t("trip.fields.trailer")} value={d.trailer?.registration ?? t("trip.noTrailer")} colors={colors} />
              <KV label={t("trip.fields.startOdometer")} value={d.start_odometer != null ? String(d.start_odometer) : "—"} colors={colors} />
            </View>

            {/* Finansije */}
            <View style={{ gap: 12 }}>
              <SectionTitle text={t("trip.section.finance")} colors={colors} />
              <Field label={t("trip.fields.revenue")} value={revenue} onChangeText={setRevenue}
                keyboardType="numeric" placeholder="0.00" colors={colors} />
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("trip.fields.driverPayMode")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {PAY_MODES.map((m) => {
                    const active = payMode === m;
                    return (
                      <Pressable key={m} onPress={() => setPayMode(active ? null : m)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : colors.surface,
                        }}>
                        <Text style={{ color: active ? colors.onPrimary : colors.text, fontSize: 13 }}>
                          {t(`trip.payMode.${m}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Field label={t("trip.fields.driverPay")} value={driverPay} onChangeText={setDriverPay}
                keyboardType="numeric" placeholder="0.00" colors={colors} />
              <Pressable onPress={() => saveFinance.mutate()} disabled={saveFinance.isPending}
                style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: saveFinance.isPending ? 0.6 : 1 }}>
                <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                  {saveFinance.isPending ? t("common.saving") : t("common.save")}
                </Text>
              </Pressable>
            </View>

            {/* Troškovi */}
            <View style={{ gap: 12 }}>
              <SectionTitle text={t("expense.section")} colors={colors} />

              {expenseRows.length === 0 ? (
                <Text style={{ color: colors.textMuted }}>{t("expense.empty")}</Text>
              ) : (
                <>
                  {expenseRows.map((e) => (
                    <View key={e.id} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`expense.categories.${e.category}`)}</Text>
                        <Pressable onPress={() => confirmDeleteExpense(e.id)} hitSlop={8} style={{ padding: 4 }}>
                          <Text style={{ color: colors.danger, fontSize: 18 }}>×</Text>
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.textMuted }}>{fmtMoney(e.original_amount, e.original_currency)}</Text>
                        <Text style={{ color: colors.text }}>{fmtMoney(e.base_amount, e.base_currency)}</Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {fmtDate(e.occurred_at)}{e.country ? ` · ${e.country}` : ""}{e.liters != null ? ` · ${e.liters} L` : ""}
                      </Text>
                      {e.note ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{e.note}</Text> : null}
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 4 }}>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{t("expense.total")}</Text>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{fmtMoney(expensesTotal, baseCurrency)}</Text>
                  </View>
                </>
              )}

              {/* Forma: novi trošak (deljena komponenta) */}
              <ExpenseForm colors={colors} onSubmit={submitExpense} />
            </View>

            {/* Dnevnik događaja */}
            <View style={{ gap: 10 }}>
              <SectionTitle text={t("trip.section.events")} colors={colors} />
              {(events.data ?? []).length === 0 ? (
                <Text style={{ color: colors.textMuted }}>{t("trip.noEvents")}</Text>
              ) : (
                (events.data ?? []).map((ev) => (
                  <View key={ev.id} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`trip.events.${ev.type}`)}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDateTime(ev.occurred_at)}</Text>
                    </View>
                    {ev.location ? <Text style={{ color: colors.textMuted, marginTop: 2 }}>{ev.location}</Text> : null}
                    {ev.note ? <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 12 }}>{ev.note}</Text> : null}
                  </View>
                ))
              )}
            </View>

            {/* Dodaj događaj */}
            <View style={{ gap: 12 }}>
              <SectionTitle text={t("trip.addEvent")} colors={colors} />
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("trip.fields.eventType")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {EVENT_TYPES.map((et) => {
                    const active = eventType === et;
                    return (
                      <Pressable key={et} onPress={() => setEventType(et)}
                        style={{
                          paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : colors.surface,
                        }}>
                        <Text style={{ color: active ? colors.onPrimary : colors.text }}>{t(`trip.events.${et}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Field label={t("trip.fields.occurredAt")} value={occurredAt} onChangeText={setOccurredAt}
                placeholder="YYYY-MM-DD HH:mm" autoCapitalize="none" colors={colors} />
              <Field label={t("trip.fields.location")} value={location} onChangeText={setLocation}
                colors={colors} />
              <Field label={t("trip.fields.note")} value={note} onChangeText={setNote}
                colors={colors} />
              <Pressable onPress={() => addEvent.mutate()} disabled={addEvent.isPending}
                style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: addEvent.isPending ? 0.6 : 1 }}>
                <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                  {addEvent.isPending ? t("common.saving") : t("trip.addEvent")}
                </Text>
              </Pressable>
            </View>
        </ScrollView>
      )}
    </ModalScaffold>
  );
}

// ── Male reusable komponente (koristi ih detalj ture) ──
function SectionTitle({ text, colors }: { text: string; colors: Palette }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{text}</Text>;
}

function KV({ label, value, colors }: { label: string; value: string; colors: Palette }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}
