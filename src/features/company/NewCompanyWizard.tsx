// Čarobnjak „Otvori novu firmu" (samouslužni ulaz) — 3 koraka, „Nazad" bez gubitka (stanje u
// roditelju; REVERZIBILNOST). Korak 1: naziv + zemlja + valuta (predlog po zemlji). Korak 2
// (preskočiv): prvo vozilo (tip + registracija). Korak 3: pregled → create_company_self → gate reload.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, PickerField, ModalScaffold } from "../../components/form";
import { CountryPickerField } from "./CountryPickerField";
import { CURRENCIES, suggestCurrency } from "../../lib/currencies";
import { listVehicleTypes, createCompanySelf } from "./api";
import { createVehicle } from "../fleet/api";

export function NewCompanyWizard({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const vtypesQ = useQuery({ queryKey: ["vehicle-types"], queryFn: listVehicleTypes });

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [addVehicle, setAddVehicle] = useState(false);
  const [vehType, setVehType] = useState<string | null>(null);
  const [vehReg, setVehReg] = useState("");

  const onCountry = (code: string | null) => { setCountry(code); setCurrency(suggestCurrency(code)); };

  const create = useMutation({
    mutationFn: async () => {
      await createCompanySelf(name.trim(), country, currency);
      if (addVehicle && vehReg.trim()) {
        await createVehicle({ registration: vehReg.trim(), type_id: vehType });
      }
    },
    onSuccess: () => { qc.clear(); onCreated(); },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const step1Valid = name.trim().length > 0 && currency.length > 0;
  const back = () => (step > 1 ? setStep((s) => s - 1) : onClose());
  const next = () => setStep((s) => Math.min(3, s + 1));
  const primaryLabel = step < 3 ? t("trip.wizard.next") : create.isPending ? t("common.saving") : t("company.create");
  const primaryDisabled = (step === 1 && !step1Valid) || (step === 3 && create.isPending);

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingBottom: 8 }}>
          <Pressable onPress={back} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 16 }}>{step > 1 ? t("trip.wizard.back") : t("common.cancel")}</Text></Pressable>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("company.wizardTitle")}</Text>
          <Pressable onPress={step < 3 ? next : () => create.mutate()} disabled={primaryDisabled} hitSlop={8}>
            <Text style={{ color: primaryDisabled ? colors.textMuted : colors.primary, fontWeight: "700", fontSize: 16 }}>{primaryLabel}</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", paddingBottom: 8 }}>{t("trip.wizard.stepOf", { current: step, total: 3 })}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <Field label={t("company.name")} value={name} onChangeText={setName} autoCapitalize="sentences" colors={colors} />
            <CountryPickerField label={t("company.country")} value={country} onSelect={onCountry} />
            <PickerField label={t("company.currency")} value={currency}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              placeholder={t("company.currency")} onSelect={(v) => setCurrency(v ?? "EUR")} colors={colors} />
          </>
        )}

        {step === 2 && (
          <>
            <Pressable onPress={() => setAddVehicle((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
              <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: addVehicle ? colors.primary : colors.border, backgroundColor: addVehicle ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                {addVehicle && <Text style={{ color: colors.onPrimary, fontWeight: "800" }}>✓</Text>}
              </View>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{t("company.addFirstVehicle")}</Text>
            </Pressable>
            {addVehicle && (
              <>
                <PickerField label={t("company.vehicleType")} value={vehType}
                  options={(vtypesQ.data ?? []).map((vt) => ({ value: vt.id, label: t(vt.name_key) }))}
                  placeholder={t("trip.select")} onSelect={setVehType} colors={colors} />
                <Field label={t("fleet.fields.registration")} value={vehReg} onChangeText={setVehReg} autoCapitalize="characters" colors={colors} />
              </>
            )}
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("company.step2Hint")}</Text>
          </>
        )}

        {step === 3 && (
          <View style={{ gap: 10 }}>
            <Review k={t("company.name")} v={name.trim() || "—"} colors={colors} />
            <Review k={t("company.country")} v={country ?? "—"} colors={colors} />
            <Review k={t("company.currency")} v={currency} colors={colors} />
            {addVehicle && vehReg.trim() ? (
              <Review k={t("company.firstVehicle")} v={vehReg.trim()} colors={colors} />
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>{t("company.reviewHint")}</Text>
          </View>
        )}
      </ScrollView>
    </ModalScaffold>
  );
}

function Review({ k, v, colors }: { k: string; v: string; colors: Palette }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 8 }}>
      <Text style={{ color: colors.textMuted }}>{k}</Text>
      <Text style={{ color: colors.text, fontWeight: "600" }}>{v}</Text>
    </View>
  );
}
