// Čarobnjak „Nova tura" (vlasnik) — 4 koraka sa „Nazad" bez gubitka unosa
// (celo stanje živi ovde; koraci renderuju podskup — pravilo REVERZIBILNOST #1):
//  ① Polazno mesto + početna km   ② Utovari i istovari (StopsEditor)
//  ③ Vozač                        ④ Vozilo + prikolica + vozarina → Sačuvaj
// Čuvanje: trips + trip_stops (seq po redosledu); destination = poslednji istovar.
import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { notify } from "../../lib/confirm";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, ModalScaffold, PickerField } from "../../components/form";
import { toNum, toInt } from "../../lib/num";
import { ownerCreateTrip } from "./api";
import { StopsEditor, defaultStopDrafts, draftsToInput, type StopDraft } from "./stops";
import { listDrivers, listVehicles, listTrailers } from "../fleet/api";
import { CustomerPickerField } from "../customers/CustomerPickerField";

const TOTAL_STEPS = 4;

export function NewTripModal({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const drivers = useQuery({ queryKey: ["fleet", "drivers"], queryFn: listDrivers });
  const vehicles = useQuery({ queryKey: ["fleet", "vehicles"], queryFn: listVehicles });
  const trailers = useQuery({ queryKey: ["fleet", "trailers"], queryFn: listTrailers });

  const [step, setStep] = useState(1);
  // Celo stanje čarobnjaka (preživljava Nazad/Dalje).
  const [origin, setOrigin] = useState("");
  const [startOdometer, setStartOdometer] = useState("");
  const [stops, setStops] = useState<StopDraft[]>(defaultStopDrafts);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [revenue, setRevenue] = useState("");

  const save = useMutation({
    mutationFn: () =>
      ownerCreateTrip({
        driver_id: driverId!,
        vehicle_id: vehicleId!,
        trailer_id: trailerId,
        origin: origin.trim() || null,
        start_odometer: toInt(startOdometer),
        revenue: toNum(revenue),
        customer_id: customerId,
        stops: draftsToInput(stops),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-trips"] });
      onClose();
    },
    onError: (e) => notify({ title: t("common.error"), message: String((e as Error).message ?? e) }),
  });

  const canSave = !!driverId && !!vehicleId && !save.isPending;
  const back = () => (step > 1 ? setStep((s) => s - 1) : onClose());
  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <WizardHeader
        title={t("trip.newTrip")}
        stepLabel={t("trip.wizard.stepOf", { current: step, total: TOTAL_STEPS })}
        backLabel={step > 1 ? t("trip.wizard.back") : t("common.cancel")}
        onBack={back}
        primaryLabel={step < TOTAL_STEPS ? t("trip.wizard.next") : save.isPending ? t("common.saving") : t("common.save")}
        onPrimary={step < TOTAL_STEPS ? next : () => save.mutate()}
        primaryDisabled={step === TOTAL_STEPS && !canSave}
        colors={colors}
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t(`trip.wizard.step${step}`)}</Text>

        {step === 1 && (
          <>
            <Field label={t("trip.fields.origin")} value={origin} onChangeText={setOrigin}
              placeholder="Beograd" autoCapitalize="sentences" colors={colors} />
            <Field label={t("trip.fields.startOdometer")} value={startOdometer} onChangeText={setStartOdometer}
              keyboardType="numeric" placeholder="0" colors={colors} />
          </>
        )}

        {step === 2 && <StopsEditor items={stops} onChange={setStops} colors={colors} />}

        {step === 3 && (
          <PickerField label={t("trip.fields.driver")} value={driverId}
            options={(drivers.data ?? []).map((d) => ({ value: d.id, label: d.full_name }))}
            placeholder={t("trip.select")} onSelect={setDriverId} colors={colors} />
        )}

        {step === 4 && (
          <>
            <PickerField label={t("trip.fields.vehicle")} value={vehicleId}
              options={(vehicles.data ?? []).map((v) => ({
                value: v.id,
                label: v.make_model ? `${v.registration} · ${v.make_model}` : v.registration,
              }))}
              placeholder={t("trip.select")} onSelect={setVehicleId} colors={colors} />
            <PickerField label={t("trip.fields.trailer")} value={trailerId}
              options={(trailers.data ?? []).map((tr) => ({ value: tr.id, label: tr.registration }))}
              placeholder={t("trip.noTrailer")} clearLabel={t("trip.noTrailer")} onSelect={setTrailerId} colors={colors} />
            <CustomerPickerField value={customerId} onSelect={setCustomerId} />
            <Field label={t("trip.fields.revenue")} value={revenue} onChangeText={setRevenue}
              keyboardType="numeric" placeholder="0.00" colors={colors} />
          </>
        )}
      </ScrollView>
    </ModalScaffold>
  );
}

// Zaglavlje čarobnjaka: levo „Nazad"/„Otkaži", sredina korak N/M, desno „Dalje"/„Sačuvaj".
function WizardHeader({
  title, stepLabel, backLabel, onBack, primaryLabel, onPrimary, primaryDisabled, colors,
}: {
  title: string; stepLabel: string; backLabel: string; onBack: () => void;
  primaryLabel: string; onPrimary: () => void; primaryDisabled: boolean; colors: Palette;
}) {
  return (
    <View style={{ borderBottomWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingBottom: 8 }}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{backLabel}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{title}</Text>
        <Pressable onPress={onPrimary} disabled={primaryDisabled} hitSlop={8}>
          <Text style={{ color: primaryDisabled ? colors.textMuted : colors.primary, fontWeight: "700", fontSize: 16 }}>{primaryLabel}</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", paddingBottom: 8 }}>{stepLabel}</Text>
    </View>
  );
}
