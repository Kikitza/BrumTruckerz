// „Novi/Izmeni rok" vođen ŠIFARNIKOM: prvo izbor TIPA (po vrsti subjekta) ili „Prilagođen".
// Tip popuni naziv i PREDLOŽI datum iz intervala (izmenjivo); needs_country traži zemlju; za VOZILO
// izbor režima Datum/Kilometraža (due_km + „još X km"). Izmena može promeniti tip/režim (REVERZIBILNOST).
import { useState } from "react";
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { Field, DateField, ModalScaffold } from "../../components/form";
import { toNum } from "../../lib/num";
import {
  listReminderTypes, createReminder, updateReminder, deleteReminder,
  type ReminderSubjectType, type ReminderRow, type ReminderTypeCatalog, type ReminderMode,
} from "./api";
import { proposeDateFromInterval, kmRemaining } from "./status";

const todayYMD = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function ReminderFormModal({
  subjectType, subjectId, subjectOdometer, row, onClose,
}: {
  subjectType: ReminderSubjectType;
  subjectId: string;
  subjectOdometer: number | null;
  row?: ReminderRow | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const editing = !!row;

  const typesQ = useQuery({ queryKey: ["reminder-types"], queryFn: listReminderTypes });
  const types = (typesQ.data ?? []).filter((x) => x.subject_kind === subjectType);

  // Izabrani tip: pri izmeni izvedi iz row.type_id; inače biramo iz liste (null dok se ne izabere).
  const [type, setType] = useState<ReminderTypeCatalog | null | undefined>(undefined); // undefined = još biramo
  const [isCustom, setIsCustom] = useState(false);
  const [label, setLabel] = useState(row?.label ?? "");
  const [mode, setMode] = useState<ReminderMode>(row?.mode ?? "date");
  const [dueDate, setDueDate] = useState<string | null>(row?.due_date ?? null);
  const [dueKm, setDueKm] = useState(row?.due_km != null ? String(row.due_km) : "");
  const [country, setCountry] = useState(row?.country_code ?? "");

  // Inicijalizacija izbora tipa pri izmeni (kad stigne katalog).
  if (editing && type === undefined && typesQ.data) {
    const found = row!.type_id ? types.find((x) => x.id === row!.type_id) ?? null : null;
    setType(found);
    setIsCustom(!found);
  }

  const pickType = (ty: ReminderTypeCatalog | null) => {
    setType(ty);
    setIsCustom(ty == null);
    if (ty) {
      setLabel("");
      if (mode === "date") setDueDate(proposeDateFromInterval(todayYMD(), ty.default_interval_months));
    }
  };

  const save = useMutation({
    mutationFn: () => {
      const input = {
        subjectType, subjectId,
        typeId: type?.id ?? null,
        category: type?.code ?? "custom",
        label: isCustom ? (label.trim() || null) : null,
        mode,
        dueDate: mode === "date" ? dueDate : null,
        dueKm: mode === "km" ? toNum(dueKm) : null,
        issuedAt: row?.issued_at ?? null,
        countryCode: type?.needs_country ? (country.trim().toUpperCase().slice(0, 2) || null) : null,
      };
      return editing ? updateReminder(row!.id, input) : createReminder(input);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); onClose(); },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const del = useMutation({
    mutationFn: () => deleteReminder(row!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); onClose(); },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });
  const confirmDelete = () => Alert.alert(t("reminders.deleteConfirm"), undefined, [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("common.delete"), style: "destructive", onPress: () => del.mutate() },
  ]);

  // Faza izbora tipa (samo pri kreiranju, dok tip nije izabran).
  const choosing = !editing && type === undefined;

  const title = isCustom ? t("reminders.category.custom") : type ? t(type.name_key) : t("reminders.newTitle");
  const km = kmRemaining(subjectOdometer, toNum(dueKm));
  const valid =
    !save.isPending &&
    (mode === "km" ? (toNum(dueKm) ?? 0) > 0 : !!dueDate) &&
    (isCustom ? label.trim().length > 0 : !!type) &&
    (!type?.needs_country || country.trim().length >= 2);

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>{choosing ? t("reminders.newTitle") : title}</Text>
        {choosing ? <View style={{ width: 48 }} /> : (
          <Pressable onPress={() => save.mutate()} disabled={!valid} hitSlop={8}>
            <Text style={{ color: valid ? colors.primary : colors.textMuted, fontWeight: "700", fontSize: 16 }}>{save.isPending ? t("common.saving") : t("common.save")}</Text>
          </Pressable>
        )}
      </View>

      {typesQ.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : choosing ? (
        <FlatList
          data={types}
          keyExtractor={(x) => x.id}
          ListFooterComponent={
            <Pressable onPress={() => pickType(null)} style={{ padding: 16, borderTopWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("reminders.customType")}</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => pickType(item)} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text }}>{t(item.name_key)}</Text>
            </Pressable>
          )}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {/* Promena tipa (i pri izmeni) */}
          {!editing && (
            <Pressable onPress={() => setType(undefined)} hitSlop={6} style={{ alignSelf: "flex-start" }}>
              <Text style={{ color: colors.primary, fontWeight: "600" }}>‹ {t("reminders.changeType")}</Text>
            </Pressable>
          )}

          {isCustom && (
            <Field label={t("reminders.customName")} value={label} onChangeText={setLabel} autoCapitalize="sentences" colors={colors} />
          )}

          {/* Režim (samo VOZILO): Datum / Kilometraža */}
          {subjectType === "vehicle" && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("reminders.mode.label")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["date", "km"] as ReminderMode[]).map((m) => {
                  const active = mode === m;
                  return (
                    <Pressable key={m} onPress={() => setMode(m)}
                      style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }}>
                      <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: "600" }}>{t(`reminders.mode.${m}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {mode === "date" ? (
            <DateField label={t("reminders.dueDate")} value={dueDate} onChange={setDueDate} colors={colors} placeholder="—" />
          ) : (
            <>
              <Field label={t("reminders.dueKm")} value={dueKm} onChangeText={setDueKm} keyboardType="numeric" placeholder="0" colors={colors} />
              {km != null && (
                <Text style={{ color: km <= 500 ? colors.danger : km <= 2000 ? colors.warn : colors.textMuted, fontSize: 13 }}>
                  {km < 0 ? t("reminders.km.over", { count: Math.abs(km) }) : t("reminders.km.remaining", { count: km })}
                </Text>
              )}
            </>
          )}

          {type?.needs_country && (
            <Field label={t("reminders.country")} value={country} onChangeText={setCountry} autoCapitalize="characters" placeholder="AT" colors={colors} />
          )}

          {editing && (
            <Pressable onPress={confirmDelete} style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 8, padding: 12, alignItems: "center" }}>
              <Text style={{ color: colors.danger, fontWeight: "600" }}>{t("common.delete")}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </ModalScaffold>
  );
}
