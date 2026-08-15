// Modal „Detalj ture" (vlasnik): podaci + finansije + troškovi + dnevnik događaja.
// Izdvojeno iz ekrana tura (app/(owner)/trips/index.tsx) — čisto premeštanje, bez promene logike.
import { useEffect, useState, type ReactNode } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { fmtDateTime, fmtDate, fmtMoney } from "../../lib/format";
import { Field, ModalScaffold, PickerField } from "../../components/form";
import { Collapsible } from "../../components/Collapsible";
import { toNum, toInt } from "../../lib/num";
import {
  ownerGetTrip, ownerUpdateTripFinance, ownerUpdateTripAssignment, ownerListTripEvents, ownerAddTripEvent,
  listTripStops, ownerUpdateTripRoute, isTripArchived,
  type EventType, type DriverPayMode,
} from "./api";
import { RouteView, StopsEditor, stopsToDrafts, type StopDraft } from "./stops";
import { listDrivers, listVehicles, listTrailers } from "../fleet/api";
import { listTripExpenses, ownerAddExpense, ownerDeleteExpense } from "../expenses/api";
import { ExpenseForm, type ExpenseFormValues } from "../expenses/ExpenseForm";
import { AttachmentsSection } from "../attachments/AttachmentsSection";
import { expenseAttachmentKind } from "../attachments/api";

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
  const stops = useQuery({ queryKey: ["trip-stops", tripId], queryFn: () => listTripStops(tripId) });

  // Flota za zamenu dodele (isti queryKey kao „Nova tura" -> deljen keš).
  const drivers = useQuery({ queryKey: ["fleet", "drivers"], queryFn: listDrivers });
  const vehicles = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listVehicles });
  const trailers = useQuery({ queryKey: ["fleet", "trailers"], queryFn: listTrailers });

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

  // ── Dodela (vozač/vozilo/prikolica) — zamena bez uticaja na cenu ture ──
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  useEffect(() => {
    const d = trip.data;
    if (!d) return;
    setDriverId(d.driver_id);
    setVehicleId(d.vehicle_id);
    setTrailerId(d.trailer_id ?? null);
  }, [trip.data?.id]);

  // Izmena dozvoljena dok tura nije arhivirana (= završena). Isti predikat kao lista.
  const assignEditable = !!trip.data && !isTripArchived(trip.data);
  const assignChanged =
    !!trip.data &&
    (driverId !== trip.data.driver_id ||
      vehicleId !== trip.data.vehicle_id ||
      (trailerId ?? null) !== (trip.data.trailer_id ?? null));

  const saveAssignment = useMutation({
    mutationFn: () =>
      ownerUpdateTripAssignment(tripId, {
        driver_id: driverId!,
        vehicle_id: vehicleId!,
        trailer_id: trailerId ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["owner-trips"] });
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });
  // Aktivno samo kad je nešto stvarno promenjeno i oba obavezna izabrana.
  const canSaveAssignment =
    assignEditable && assignChanged && !!driverId && !!vehicleId && !saveAssignment.isPending;

  // ── Izmena RUTE (polazno mesto, početna km, stanice) — reverzibilnost #2 ──
  // Dozvoljeno dok tura nije arhivirana; vozarina i dodela se ovim tokom NE diraju.
  const [routeEditing, setRouteEditing] = useState(false);
  const [editOrigin, setEditOrigin] = useState("");
  const [editStartOdo, setEditStartOdo] = useState("");
  const [editStops, setEditStops] = useState<StopDraft[]>([]);

  const startRouteEdit = () => {
    const dd = trip.data;
    if (!dd) return;
    setEditOrigin(dd.origin ?? "");
    setEditStartOdo(dd.start_odometer != null ? String(dd.start_odometer) : "");
    setEditStops(stopsToDrafts(stops.data ?? []));
    setRouteEditing(true);
  };

  const saveRoute = useMutation({
    mutationFn: () =>
      ownerUpdateTripRoute(tripId, {
        origin: editOrigin.trim() || null,
        startOdometer: toInt(editStartOdo),
        stops: editStops.map((d) => ({ existingId: d.existingId, kind: d.kind, place: d.place, note: d.note })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trip-stops", tripId] });
      qc.invalidateQueries({ queryKey: ["owner-trips"] });
      qc.invalidateQueries({ queryKey: ["driver-trip-stops"] }); // vozačev prikaz rute
      setRouteEditing(false);
    },
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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {/* Podaci (OTVOREN) — ruta/stanice, status, dodela, km */}
            <Collapsible title={t("trip.section.info")} colors={colors} defaultOpen>
              <SectionBody>
                {routeEditing ? (
                  <View style={{ gap: 12 }}>
                    <Field label={t("trip.fields.origin")} value={editOrigin} onChangeText={setEditOrigin}
                      autoCapitalize="sentences" placeholder="Beograd" colors={colors} />
                    <Field label={t("trip.fields.startOdometer")} value={editStartOdo} onChangeText={setEditStartOdo}
                      keyboardType="numeric" placeholder="0" colors={colors} />
                    <StopsEditor items={editStops} onChange={setEditStops} colors={colors} />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable onPress={() => setRouteEditing(false)}
                        style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: "center" }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>{t("common.cancel")}</Text>
                      </Pressable>
                      <Pressable onPress={() => saveRoute.mutate()} disabled={saveRoute.isPending}
                        style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: saveRoute.isPending ? 0.6 : 1 }}>
                        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                          {saveRoute.isPending ? t("common.saving") : t("common.save")}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    <RouteView origin={d.origin} destination={d.destination} stops={stops.data ?? []} colors={colors} />
                    {assignEditable && (
                      <Pressable onPress={startRouteEdit} hitSlop={8} style={{ alignSelf: "flex-start" }}>
                        <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("common.edit")}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <View style={{ alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`trip.status.${d.status}`)}</Text>
                </View>
                {assignEditable ? (
                  <View style={{ gap: 12 }}>
                    <PickerField label={t("trip.fields.driver")} value={driverId}
                      options={(drivers.data ?? []).map((dr) => ({ value: dr.id, label: dr.full_name }))}
                      placeholder={t("trip.select")} onSelect={setDriverId} colors={colors} />
                    <PickerField label={t("trip.fields.vehicle")} value={vehicleId}
                      options={(vehicles.data ?? []).map((v) => ({
                        value: v.id,
                        label: v.make_model ? `${v.registration} · ${v.make_model}` : v.registration,
                      }))}
                      placeholder={t("trip.select")} onSelect={setVehicleId} colors={colors} />
                    <PickerField label={t("trip.fields.trailer")} value={trailerId}
                      options={(trailers.data ?? []).map((tr) => ({ value: tr.id, label: tr.registration }))}
                      placeholder={t("trip.noTrailer")} clearLabel={t("trip.noTrailer")}
                      onSelect={setTrailerId} colors={colors} />
                    <Pressable onPress={() => saveAssignment.mutate()} disabled={!canSaveAssignment}
                      style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: canSaveAssignment ? 1 : 0.5 }}>
                      <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                        {saveAssignment.isPending ? t("common.saving") : t("trip.saveAssignment")}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <KV label={t("trip.fields.driver")} value={d.driver?.full_name ?? "—"} colors={colors} />
                    <KV label={t("trip.fields.vehicle")} value={d.vehicle?.registration ?? "—"} colors={colors} />
                    <KV label={t("trip.fields.trailer")} value={d.trailer?.registration ?? t("trip.noTrailer")} colors={colors} />
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("trip.assignmentLockedFinished")}</Text>
                  </>
                )}
                {!routeEditing && (
                  <KV label={t("trip.fields.startOdometer")} value={d.start_odometer != null ? String(d.start_odometer) : "—"} colors={colors} />
                )}
              </SectionBody>
            </Collapsible>

            {/* Finansije */}
            <Collapsible title={t("trip.section.finance")} colors={colors}>
              <SectionBody>
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
                            backgroundColor: active ? colors.primary : colors.bg,
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
              </SectionBody>
            </Collapsible>

            {/* Troškovi */}
            <Collapsible title={t("expense.section")} colors={colors}>
              <SectionBody>
                {expenseRows.length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>{t("expense.empty")}</Text>
                ) : (
                  <>
                    {expenseRows.map((e) => (
                      <View key={e.id} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
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
                        <AttachmentsSection expenseId={e.id} tripId={tripId} kind={expenseAttachmentKind(e.category)}
                          canDelete colors={colors} />
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
              </SectionBody>
            </Collapsible>

            {/* Dokumenti ture (CMR/faktura/carina…) */}
            <Collapsible title={t("attachment.documents")} colors={colors}>
              <SectionBody>
                <AttachmentsSection tripId={tripId} pickKind canDelete colors={colors} />
              </SectionBody>
            </Collapsible>

            {/* Dnevnik događaja */}
            <Collapsible title={t("trip.section.events")} colors={colors}>
              <SectionBody>
                {(events.data ?? []).length === 0 ? (
                  <Text style={{ color: colors.textMuted }}>{t("trip.noEvents")}</Text>
                ) : (
                  (events.data ?? []).map((ev) => (
                    <View key={ev.id} style={{ padding: 12, borderRadius: 8, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: colors.text, fontWeight: "600" }}>{t(`trip.events.${ev.type}`)}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{fmtDateTime(ev.occurred_at)}</Text>
                      </View>
                      {ev.location ? <Text style={{ color: colors.textMuted, marginTop: 2 }}>{ev.location}</Text> : null}
                      {ev.note ? <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 12 }}>{ev.note}</Text> : null}
                    </View>
                  ))
                )}
              </SectionBody>
            </Collapsible>

            {/* Dodaj događaj */}
            <Collapsible title={t("trip.addEvent")} colors={colors}>
              <SectionBody>
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
                            backgroundColor: active ? colors.primary : colors.bg,
                          }}>
                          <Text style={{ color: active ? colors.onPrimary : colors.text }}>{t(`trip.events.${et}`)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <Field label={t("trip.fields.occurredAt")} value={occurredAt} onChangeText={setOccurredAt}
                  placeholder="YYYY-MM-DD HH:mm" autoCapitalize="none" colors={colors} />
                <Field label={t("trip.fields.location")} value={location} onChangeText={setLocation} colors={colors} />
                <Field label={t("trip.fields.note")} value={note} onChangeText={setNote} colors={colors} />
                <Pressable onPress={() => addEvent.mutate()} disabled={addEvent.isPending}
                  style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: addEvent.isPending ? 0.6 : 1 }}>
                  <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                    {addEvent.isPending ? t("common.saving") : t("trip.addEvent")}
                  </Text>
                </Pressable>
              </SectionBody>
            </Collapsible>
        </ScrollView>
      )}
    </ModalScaffold>
  );
}

// ── Male reusable komponente (koristi ih detalj ture) ──
// Unutrašnji padding sadržaja sekcije (Collapsible telo je bez horizontalnog paddinga).
function SectionBody({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4, gap: 12 }}>{children}</View>;
}

function KV({ label, value, colors }: { label: string; value: string; colors: Palette }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: colors.textMuted }}>{label}</Text>
      <Text style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}
