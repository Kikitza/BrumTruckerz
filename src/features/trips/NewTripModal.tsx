// Modal „Nova tura" (vlasnik): dodela trojke (vozač+truk+prikolica) + ruta + km + vozarina.
// Izdvojeno iz ekrana tura (app/(owner)/trips/index.tsx) — čisto premeštanje, bez promene logike.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, ModalScaffold, PickerField } from "../../components/form";
import { toNum, toInt } from "../../lib/num";
import { ownerCreateTrip } from "./api";
import { listDrivers, listVehicles, listTrailers } from "../fleet/api";

export function NewTripModal({ onClose }: { onClose: () => void }) {
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
        <Field label={t("trip.fields.startOdometer")} value={startOdometer} onChangeText={setStartOdometer}
          keyboardType="numeric" placeholder="0" colors={colors} />
        <Field label={t("trip.fields.revenue")} value={revenue} onChangeText={setRevenue}
          keyboardType="numeric" placeholder="0.00" colors={colors} />
      </ScrollView>
    </ModalScaffold>
  );
}

// Header modala sa „Otkaži"/„Sačuvaj" (koristi ga NewTripModal).
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
