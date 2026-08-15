// Detalj firme (platform admin): izmena paketa/limita i statusa/naplate — sve kroz RPC.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, DateField, ModalScaffold } from "../../components/form";
import { toInt } from "../../lib/num";
import { adminSetCompanyPlan, adminSetCompanyStatus, type AdminCompany, type CompanyStatus } from "./api";

const STATUSES: CompanyStatus[] = ["active", "suspended"];

export function CompanyDetailModal({ company, onClose }: { company: AdminCompany; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [plan, setPlan] = useState(company.plan);
  const [limit, setLimit] = useState(String(company.vehicle_limit));
  const [status, setStatus] = useState<CompanyStatus>(company.status);
  const [paidUntil, setPaidUntil] = useState<string | null>(company.paid_until);
  const [note, setNote] = useState(company.billing_note ?? "");

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-companies"] });
  const fail = (e: unknown) => Alert.alert(t("common.error"), String((e as Error).message ?? e));

  const savePlan = useMutation({
    mutationFn: () => adminSetCompanyPlan(company.id, plan.trim(), toInt(limit) ?? company.vehicle_limit),
    onSuccess: refresh,
    onError: fail,
  });
  const saveStatus = useMutation({
    mutationFn: () => adminSetCompanyStatus(company.id, status, paidUntil, note.trim() || null),
    onSuccess: refresh,
    onError: fail,
  });

  const confirmStatus = () =>
    Alert.alert(t("admin.confirmStatus"), undefined, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.save"), onPress: () => saveStatus.mutate() },
    ]);

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }} numberOfLines={1}>{company.name}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {company.owner_emails ? (
          <Text style={{ color: colors.textMuted }}>{t("admin.owner")}: {company.owner_emails}</Text>
        ) : null}

        {/* Paket + limit */}
        <View style={{ gap: 12 }}>
          <SectionTitle text={t("plan.title")} colors={colors} />
          <Field label={t("plan.title")} value={plan} onChangeText={setPlan} autoCapitalize="none" colors={colors} />
          <Field label={t("admin.vehicleLimit")} value={limit} onChangeText={setLimit} keyboardType="numeric" placeholder="5" colors={colors} />
          <PrimaryButton label={savePlan.isPending ? t("common.saving") : t("admin.savePlan")} onPress={() => savePlan.mutate()} disabled={savePlan.isPending} colors={colors} />
        </View>

        {/* Status + naplata */}
        <View style={{ gap: 12 }}>
          <SectionTitle text={t("admin.statusTitle")} colors={colors} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {STATUSES.map((s) => {
              const active = status === s;
              return (
                <Pressable key={s} onPress={() => setStatus(s)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }}>
                  <Text style={{ color: active ? colors.onPrimary : colors.text }}>{t(`admin.status.${s}`)}</Text>
                </Pressable>
              );
            })}
          </View>
          <DateField label={t("admin.paidUntil")} value={paidUntil} onChange={setPaidUntil} colors={colors} placeholder="—" />
          <Field label={t("admin.billingNote")} value={note} onChangeText={setNote} colors={colors} />
          <PrimaryButton label={saveStatus.isPending ? t("common.saving") : t("admin.saveStatus")} onPress={confirmStatus} disabled={saveStatus.isPending} colors={colors} />
        </View>
      </ScrollView>
    </ModalScaffold>
  );
}

function SectionTitle({ text, colors }: { text: string; colors: Palette }) {
  return <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{text}</Text>;
}

function PrimaryButton({ label, onPress, disabled, colors }: { label: string; onPress: () => void; disabled: boolean; colors: Palette }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
