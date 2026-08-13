// Ture (vlasnik): lista + kreiranje nove ture + detalj (dnevnik događaja,
// dodavanje događaja, izmena finansija). Vlasnik radi ONLINE — direktan pristup
// kroz src/features/trips/api.ts. Boje SAMO iz tokena, stringovi SAMO kroz t().
import { useEffect, useState } from "react";
import {
  View, Text, FlatList, Pressable, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../../src/lib/theme";
import { fmtDateTime, fmtDate, fmtMoney } from "../../../src/lib/format";
import { Field, DateField, ModalScaffold } from "../../../src/components/form";
import {
  ownerListTrips, ownerCreateTrip, ownerGetTrip, ownerUpdateTripFinance,
  ownerListTripEvents, ownerAddTripEvent, tripTitle,
  type EventType, type DriverPayMode,
} from "../../../src/features/trips/api";
import {
  ownerListTripExpenses, ownerAddExpense, ownerDeleteExpense,
  EXPENSE_CATEGORIES, type ExpenseCategory,
} from "../../../src/features/expenses/api";
import { listDrivers, listVehicles, listTrailers } from "../../../src/features/fleet/api";

const EVENT_TYPES: EventType[] = ["load", "unload", "border", "driving", "rest", "other"];
const PAY_MODES: DriverPayMode[] = ["per_diem", "percentage", "fixed"];
// Najčešće valute na evropskim turama (original sa računa). EUR je bazna podrazumevana.
const CURRENCIES: string[] = ["EUR", "RSD", "PLN", "HUF", "CZK", "RON", "BGN", "CHF", "USD", "GBP", "TRY", "BAM", "MKD"];

// ── Pomoćni parseri (isti stil kao fleet) ──
const toNum = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const toInt = (s: string): number | null => {
  const n = toNum(s);
  return n == null ? null : Math.round(n);
};
const pad = (n: number) => String(n).padStart(2, "0");
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
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

// ── Reusable "select" (padajuća lista kroz slide modal — samo tokeni) ──
function PickerField({
  label, value, options, placeholder, clearLabel, onSelect, colors, t,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  placeholder: string;
  clearLabel?: string; // ako je zadato, nudi opciju "očisti" (za opcionu prikolicu)
  onSelect: (v: string | null) => void;
  colors: Palette;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: 12, backgroundColor: colors.surface,
        }}
      >
        <Text style={{ color: current ? colors.text : colors.textMuted }}>
          {current ? current.label : placeholder}
        </Text>
      </Pressable>

      {open && (
        <ModalScaffold colors={colors} onRequestClose={() => setOpen(false)}>
          <View
            style={{
              flexDirection: "row", justifyContent: "space-between", alignItems: "center",
              padding: 16, borderBottomWidth: 1, borderColor: colors.border,
            }}
          >
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{label}</Text>
            <View style={{ width: 48 }} />
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            ListHeaderComponent={
              clearLabel ? (
                <Pressable
                  onPress={() => { onSelect(null); setOpen(false); }}
                  style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: value == null ? colors.primary : colors.textMuted }}>
                    {clearLabel}
                  </Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect(item.value); setOpen(false); }}
                style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: item.value === value ? colors.primary : colors.text }}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </ModalScaffold>
      )}
    </View>
  );
}

// ── Ekran ──
type ModalState = { mode: "none" | "new" | "detail"; tripId?: string };

export default function OwnerTrips() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalState>({ mode: "none" });

  const trips = useQuery({ queryKey: ["owner-trips"], queryFn: ownerListTrips });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 12 }}>
        <Pressable
          onPress={() => setModal({ mode: "new" })}
          style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("trip.newTrip")}</Text>
        </Pressable>
      </View>

      {trips.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={trips.data ?? []}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setModal({ mode: "detail", tripId: item.id })}
              style={{
                padding: 16, borderBottomWidth: 1, borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {tripTitle(item.origin, item.destination) ?? item.title ?? item.id.slice(0, 8)}
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 2 }}>
                {t(`trip.status.${item.status}`)}
              </Text>
            </Pressable>
          )}
        />
      )}

      {modal.mode === "new" && <NewTripModal onClose={() => setModal({ mode: "none" })} />}
      {modal.mode === "detail" && modal.tripId && (
        <TripDetailModal tripId={modal.tripId} onClose={() => setModal({ mode: "none" })} />
      )}
    </View>
  );
}

// ── Nova tura ──
function NewTripModal({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const drivers = useQuery({ queryKey: ["fleet", "drivers"], queryFn: listDrivers });
  const vehicles = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listVehicles });
  const trailers = useQuery({ queryKey: ["fleet", "trailers"], queryFn: listTrailers });

  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startOdometer, setStartOdometer] = useState("");
  const [revenue, setRevenue] = useState("");

  const save = useMutation({
    mutationFn: () =>
      ownerCreateTrip({
        driver_id: driverId!,
        vehicle_id: vehicleId!,
        trailer_id: trailerId,
        origin: origin.trim() || null,
        destination: destination.trim() || null,
        start_odometer: toInt(startOdometer),
        revenue: toNum(revenue),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-trips"] });
      onClose();
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const valid = !!driverId && !!vehicleId;

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <Header
        title={t("trip.newTrip")}
        onCancel={onClose}
        onSave={() => save.mutate()}
        saveDisabled={!valid || save.isPending}
        saving={save.isPending}
        colors={colors}
        t={t}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Field label={t("trip.fields.origin")} value={origin} onChangeText={setOrigin}
          placeholder="Beograd" colors={colors} />
        <Field label={t("trip.fields.destination")} value={destination} onChangeText={setDestination}
          placeholder="München" colors={colors} />
        <PickerField label={t("trip.fields.driver")} value={driverId}
          options={(drivers.data ?? []).map((d) => ({ value: d.id, label: d.full_name }))}
          placeholder={t("trip.select")} onSelect={setDriverId} colors={colors} t={t} />
        <PickerField label={t("trip.fields.vehicle")} value={vehicleId}
          options={(vehicles.data ?? []).map((v) => ({
            value: v.id,
            label: v.make_model ? `${v.registration} · ${v.make_model}` : v.registration,
          }))}
          placeholder={t("trip.select")} onSelect={setVehicleId} colors={colors} t={t} />
        <PickerField label={t("trip.fields.trailer")} value={trailerId}
          options={(trailers.data ?? []).map((tr) => ({ value: tr.id, label: tr.registration }))}
          placeholder={t("trip.noTrailer")} clearLabel={t("trip.noTrailer")}
          onSelect={setTrailerId} colors={colors} t={t} />
        <Field label={t("trip.fields.startOdometer")} value={startOdometer} onChangeText={setStartOdometer}
          keyboardType="numeric" placeholder="0" colors={colors} />
        <Field label={t("trip.fields.revenue")} value={revenue} onChangeText={setRevenue}
          keyboardType="numeric" placeholder="0.00" colors={colors} />
      </ScrollView>
    </ModalScaffold>
  );
}

// ── Detalj ture ──
function TripDetailModal({ tripId, onClose }: { tripId: string; onClose: () => void }) {
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
  const expenses = useQuery({ queryKey: ["trip-expenses", tripId], queryFn: () => ownerListTripExpenses(tripId) });
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("fuel");
  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("EUR");
  const [expDate, setExpDate] = useState<string | null>(todayYMD());
  const [expLiters, setExpLiters] = useState("");
  const [expCountry, setExpCountry] = useState("");
  const [expNote, setExpNote] = useState("");

  const addExpenseM = useMutation({
    mutationFn: () => {
      const amount = toNum(expAmount);
      if (amount == null) throw new Error(t("expense.invalidAmount"));
      return ownerAddExpense({
        trip_id: tripId,
        category: expCategory,
        original_amount: amount,
        original_currency: expCurrency,
        occurred_at: expDate ?? undefined,
        liters: expCategory === "fuel" ? toNum(expLiters) : null,
        country: expCountry.trim() || null,
        note: expNote.trim() || null,
      });
    },
    onSuccess: () => {
      // P&L (trip_pnl) i zbir zavise od troškova -> osveži i turu
      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      setExpAmount(""); setExpLiters(""); setExpCountry(""); setExpNote("");
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

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
  const amountValid = toNum(expAmount) != null;

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

              {/* Forma: novi trošak */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("expense.category")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {EXPENSE_CATEGORIES.map((c) => {
                    const active = expCategory === c;
                    return (
                      <Pressable key={c} onPress={() => setExpCategory(c)}
                        style={{
                          paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1,
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary : colors.surface,
                        }}>
                        <Text style={{ color: active ? colors.onPrimary : colors.text }}>{t(`expense.categories.${c}`)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Field label={t("expense.amount")} value={expAmount} onChangeText={setExpAmount}
                keyboardType="numeric" placeholder="0.00" colors={colors} />
              <PickerField label={t("expense.currency")} value={expCurrency}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                placeholder={t("trip.select")} onSelect={(v) => setExpCurrency(v ?? "EUR")} colors={colors} t={t} />
              <DateField label={t("expense.date")} value={expDate} onChange={setExpDate}
                colors={colors} placeholder="—" clearable={false} />
              {expCategory === "fuel" ? (
                <Field label={t("expense.liters")} value={expLiters} onChangeText={setExpLiters}
                  keyboardType="numeric" placeholder="0.0" colors={colors} />
              ) : null}
              <Field label={t("expense.country")} value={expCountry} onChangeText={setExpCountry}
                autoCapitalize="characters" placeholder="DE" colors={colors} />
              <Field label={t("expense.note")} value={expNote} onChangeText={setExpNote} colors={colors} />
              <Pressable onPress={() => addExpenseM.mutate()} disabled={addExpenseM.isPending || !amountValid}
                style={{
                  backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center",
                  opacity: addExpenseM.isPending || !amountValid ? 0.6 : 1,
                }}>
                <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
                  {addExpenseM.isPending ? t("common.saving") : t("expense.add")}
                </Text>
              </Pressable>
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

// ── Male reusable komponente ──
function Header({
  title, onCancel, onSave, saveDisabled, saving, colors, t,
}: {
  title: string; onCancel: () => void; onSave: () => void;
  saveDisabled: boolean; saving: boolean; colors: Palette; t: (k: string) => string;
}) {
  return (
    <View
      style={{
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        padding: 16, borderBottomWidth: 1, borderColor: colors.border,
      }}
    >
      <Pressable onPress={onCancel} hitSlop={8}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
      </Pressable>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{title}</Text>
      <Pressable onPress={onSave} disabled={saveDisabled} hitSlop={8}>
        <Text style={{ color: saveDisabled ? colors.textMuted : colors.primary, fontWeight: "700", fontSize: 16 }}>
          {saving ? t("common.saving") : t("common.save")}
        </Text>
      </Pressable>
    </View>
  );
}

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
