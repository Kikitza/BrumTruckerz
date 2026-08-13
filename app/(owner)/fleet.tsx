// Flota (vlasnik): vozila / prikolice / vozači — lista + create/update/delete.
// Sav pristup bazi ide kroz src/features/fleet/api.ts (konvencija projekta).
// Boje SAMO iz tokena (pravilo #8), stringovi SAMO kroz t() (pravilo #7).
import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../src/lib/theme";
import { fmtNumber, fmtKm, fmtDate } from "../../src/lib/format";
import { Field, DateField, ModalScaffold } from "../../src/components/form";
import {
  listVehicles, createVehicle, updateVehicle, deleteVehicle,
  listTrailers, createTrailer, updateTrailer, deleteTrailer,
  listDrivers, createDriver, updateDriver, deleteDriver,
  type Vehicle, type Trailer, type Driver, type EmploymentType,
} from "../../src/features/fleet/api";
import { getDriverMedicalReminder, setDriverMedicalReminder } from "../../src/features/reminders/api";

type Section = "vehicles" | "trailers" | "drivers";
type Item = Vehicle | Trailer | Driver;

const SECTIONS: Section[] = ["vehicles", "trailers", "drivers"];

const listFns: Record<Section, () => Promise<Item[]>> = {
  vehicles: listVehicles, trailers: listTrailers, drivers: listDrivers,
};
const deleteFns: Record<Section, (id: string) => Promise<void>> = {
  vehicles: deleteVehicle, trailers: deleteTrailer, drivers: deleteDriver,
};
const addKey: Record<Section, string> = {
  vehicles: "fleet.addVehicle", trailers: "fleet.addTrailer", drivers: "fleet.addDriver",
};
const editKey: Record<Section, string> = {
  vehicles: "fleet.editVehicle", trailers: "fleet.editTrailer", drivers: "fleet.editDriver",
};
const emptyKey: Record<Section, string> = {
  vehicles: "fleet.emptyVehicles", trailers: "fleet.emptyTrailers", drivers: "fleet.emptyDrivers",
};
const deleteKey: Record<Section, string> = {
  vehicles: "fleet.deleteVehicle", trailers: "fleet.deleteTrailer", drivers: "fleet.deleteDriver",
};

// Broj/ceo broj iz teksta (podržava zarez kao decimalni separator); prazno -> null.
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

export default function FleetScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("vehicles");
  const [modal, setModal] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });

  const list = useQuery({ queryKey: ["fleet", section], queryFn: () => listFns[section]() });

  const del = useMutation({
    mutationFn: (id: string) => deleteFns[section](id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fleet", section] }),
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const confirmDelete = (item: Item) =>
    Alert.alert(t(deleteKey[section]), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => del.mutate(item.id) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Segment kontrola: tri sekcije flote */}
      <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
        {SECTIONS.map((s) => {
          const active = section === s;
          return (
            <Pressable
              key={s}
              onPress={() => setSection(s)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center",
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : colors.surface,
              }}
            >
              <Text style={{ color: active ? colors.onPrimary : colors.text, fontWeight: "600" }}>
                {t(`fleet.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Dodavanje nove stavke u aktivnoj sekciji */}
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <Pressable
          onPress={() => setModal({ open: true, item: null })}
          style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t(addKey[section])}</Text>
        </Pressable>
      </View>

      {list.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(x) => x.id}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", color: colors.textMuted, marginTop: 24 }}>
              {t(emptyKey[section])}
            </Text>
          }
          renderItem={({ item }) => (
            <Row
              colors={colors}
              d={describe(section, item, t)}
              onEdit={() => setModal({ open: true, item })}
              onDelete={() => confirmDelete(item)}
              deleteLabel={t("common.delete")}
            />
          )}
        />
      )}

      {modal.open && (
        <FleetFormModal
          section={section}
          item={modal.item}
          onClose={() => setModal({ open: false, item: null })}
        />
      )}
    </View>
  );
}

// ── Red u listi ──
type RowInfo = { title: string; sub?: string; meta?: string };

function describe(section: Section, item: Item, t: (k: string) => string): RowInfo {
  if (section === "vehicles") {
    const v = item as Vehicle;
    const meta = [
      v.norm_consumption != null ? `${fmtNumber(v.norm_consumption, 1)} L/100km` : null,
      v.current_odometer != null ? fmtKm(v.current_odometer) : null,
    ].filter(Boolean).join("  ·  ");
    return { title: v.registration, sub: v.make_model ?? undefined, meta: meta || undefined };
  }
  if (section === "trailers") {
    const tr = item as Trailer;
    return { title: tr.registration, sub: tr.type ?? undefined };
  }
  const d = item as Driver;
  return {
    title: d.full_name,
    sub: d.employment_type ? t(`fleet.employment.${d.employment_type}`) : undefined,
    meta: d.contract_end ? `${t("fleet.fields.contractEnd")}: ${fmtDate(d.contract_end)}` : undefined,
  };
}

function Row({
  colors, d, onEdit, onDelete, deleteLabel,
}: {
  colors: Palette;
  d: RowInfo;
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", padding: 16,
        borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
      }}
    >
      <Pressable style={{ flex: 1 }} onPress={onEdit}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{d.title}</Text>
        {d.sub ? <Text style={{ color: colors.textMuted, marginTop: 2 }}>{d.sub}</Text> : null}
        {d.meta ? (
          <Text style={{ color: colors.textMuted, marginTop: 2, fontSize: 12 }}>{d.meta}</Text>
        ) : null}
      </Pressable>
      <Pressable onPress={onDelete} hitSlop={8} style={{ padding: 8 }}>
        <Text style={{ color: colors.danger, fontWeight: "600" }}>{deleteLabel}</Text>
      </Pressable>
    </View>
  );
}

// ── Modal forma (create + edit) ──
function FleetFormModal({
  section, item, onClose,
}: {
  section: Section;
  item: Item | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const editing = item != null;
  const it = (item ?? {}) as Partial<Vehicle & Trailer & Driver>;

  const [registration, setRegistration] = useState(it.registration ?? "");
  const [makeModel, setMakeModel] = useState(it.make_model ?? "");
  const [norm, setNorm] = useState(it.norm_consumption != null ? String(it.norm_consumption) : "");
  const [odometer, setOdometer] = useState(it.current_odometer != null ? String(it.current_odometer) : "");
  const [type, setType] = useState(it.type ?? "");
  const [fullName, setFullName] = useState(it.full_name ?? "");
  const [employmentType, setEmploymentType] = useState<EmploymentType | null>(it.employment_type ?? null);
  const [employmentStart, setEmploymentStart] = useState<string | null>(it.employment_start ?? null);
  const [contractEnd, setContractEnd] = useState<string | null>(it.contract_end ?? null);

  // Lekarsko uverenje = rok (reminders), NE kolona na drivers. Učitaj postojeći pri izmeni.
  const [medical, setMedical] = useState<string | null>(null);
  const medicalQ = useQuery({
    queryKey: ["driver-medical", item?.id ?? "new"],
    queryFn: () => getDriverMedicalReminder(item!.id),
    enabled: section === "drivers" && editing,
  });
  useEffect(() => {
    if (medicalQ.data) setMedical(medicalQ.data.due_date ?? null);
  }, [medicalQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (section === "vehicles") {
        const input = {
          registration: registration.trim(),
          make_model: makeModel.trim() || null,
          norm_consumption: toNum(norm),
          current_odometer: toInt(odometer),
        };
        return editing ? updateVehicle(item!.id, input) : createVehicle(input);
      }
      if (section === "trailers") {
        const input = { registration: registration.trim(), type: type.trim() || null };
        return editing ? updateTrailer(item!.id, input) : createTrailer(input);
      }
      const input = {
        full_name: fullName.trim(),
        employment_type: employmentType,
        employment_start: employmentStart,
        contract_end: contractEnd,
      };
      const saved = editing ? await updateDriver(item!.id, input) : await createDriver(input);
      // Medical rok upisujemo posle vozača (treba nam id novog reda za subject_id).
      await setDriverMedicalReminder(saved.id, medical);
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet", section] });
      if (item?.id) qc.invalidateQueries({ queryKey: ["driver-medical", item.id] });
      onClose();
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const valid =
    section === "drivers"
      ? fullName.trim().length > 0
      : registration.trim().length > 0;

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
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
          {t(editing ? editKey[section] : addKey[section])}
        </Text>
        <Pressable onPress={() => save.mutate()} disabled={!valid || save.isPending} hitSlop={8}>
          <Text style={{ color: valid ? colors.primary : colors.textMuted, fontWeight: "700", fontSize: 16 }}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {section === "vehicles" && (
          <>
            <Field label={t("fleet.fields.registration")} value={registration}
              onChangeText={setRegistration} autoCapitalize="characters" colors={colors} />
            <Field label={t("fleet.fields.makeModel")} value={makeModel} onChangeText={setMakeModel} colors={colors} />
            <Field label={t("fleet.fields.normConsumption")} value={norm}
              onChangeText={setNorm} keyboardType="numeric" placeholder="0.0" colors={colors} />
            <Field label={t("fleet.fields.currentOdometer")} value={odometer}
              onChangeText={setOdometer} keyboardType="numeric" placeholder="0" colors={colors} />
          </>
        )}

        {section === "trailers" && (
          <>
            <Field label={t("fleet.fields.registration")} value={registration}
              onChangeText={setRegistration} autoCapitalize="characters" colors={colors} />
            <Field label={t("fleet.fields.type")} value={type} onChangeText={setType} colors={colors} />
          </>
        )}

        {section === "drivers" && (
          <>
            <Field label={t("fleet.fields.fullName")} value={fullName}
              onChangeText={setFullName} autoCapitalize="sentences" colors={colors} />
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {t("fleet.fields.employmentType")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["indefinite", "fixed_term"] as EmploymentType[]).map((opt) => {
                  const active = employmentType === opt;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => setEmploymentType(active ? null : opt)}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center",
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : colors.surface,
                      }}
                    >
                      <Text style={{ color: active ? colors.onPrimary : colors.text }}>
                        {t(`fleet.employment.${opt}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <DateField label={t("fleet.fields.employmentStart")} value={employmentStart}
              onChange={setEmploymentStart} colors={colors} placeholder="—" />
            <DateField label={t("fleet.fields.contractEnd")} value={contractEnd}
              onChange={setContractEnd} colors={colors} placeholder="—" />
            <DateField label={t("fleet.fields.medicalValidUntil")} value={medical}
              onChange={setMedical} colors={colors} placeholder="—" />
          </>
        )}
      </ScrollView>
    </ModalScaffold>
  );
}
