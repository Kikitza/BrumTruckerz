// „Podaci izdavaoca" (invoice_settings) — jednom pre prve fakture, kasnije Izmeni u Podešavanjima.
// REVERZIBILNOST #2: forma sa postojećim vrednostima. Pristup bazi kroz invoices/api.ts.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { Field, ModalScaffold } from "../../components/form";
import { toNum } from "../../lib/num";
import { getInvoiceSettings, upsertInvoiceSettings, type InvoiceSettingsInput } from "./api";

export function InvoiceSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["invoice-settings"], queryFn: getInvoiceSettings });

  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [regNo, setRegNo] = useState("");
  const [bank, setBank] = useState("");
  const [vatRate, setVatRate] = useState("0");
  const [vatNote, setVatNote] = useState("");
  const [prefix, setPrefix] = useState("");
  const [ready, setReady] = useState(false);
  if (q.data && !ready) {
    const s = q.data;
    setLegalName(s.legal_name ?? ""); setAddress(s.address ?? ""); setTaxId(s.tax_id ?? "");
    setRegNo(s.reg_no ?? ""); setBank(s.bank_account ?? ""); setVatRate(String(s.default_vat_rate ?? 0));
    setVatNote(s.default_vat_note ?? ""); setPrefix(s.prefix ?? ""); setReady(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const input: InvoiceSettingsInput = {
        legal_name: legalName, address, tax_id: taxId, reg_no: regNo, bank_account: bank,
        default_vat_rate: toNum(vatRate) ?? 0, default_vat_note: vatNote, prefix,
      };
      return upsertInvoiceSettings(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-settings"] });
      onSaved?.();
      onClose();
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const valid = legalName.trim().length > 0 && !save.isPending;

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{t("invoice.settings.title")}</Text>
        <Pressable onPress={() => save.mutate()} disabled={!valid} hitSlop={8}>
          <Text style={{ color: valid ? colors.primary : colors.textMuted, fontWeight: "700", fontSize: 16 }}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Text>
        </Pressable>
      </View>
      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Field label={t("invoice.settings.legalName")} value={legalName} onChangeText={setLegalName} autoCapitalize="sentences" colors={colors} />
          <Field label={t("invoice.settings.address")} value={address} onChangeText={setAddress} autoCapitalize="sentences" colors={colors} />
          <Field label={t("invoice.settings.taxId")} value={taxId} onChangeText={setTaxId} autoCapitalize="characters" colors={colors} />
          <Field label={t("invoice.settings.regNo")} value={regNo} onChangeText={setRegNo} colors={colors} />
          <Field label={t("invoice.settings.bankAccount")} value={bank} onChangeText={setBank} colors={colors} />
          <Field label={t("invoice.settings.prefix")} value={prefix} onChangeText={setPrefix} placeholder="" colors={colors} />
          <Field label={t("invoice.settings.defaultVatRate")} value={vatRate} onChangeText={setVatRate} keyboardType="numeric" placeholder="0" colors={colors} />
          <Field label={t("invoice.settings.defaultVatNote")} value={vatNote} onChangeText={setVatNote} autoCapitalize="sentences" colors={colors} />
        </ScrollView>
      )}
    </ModalScaffold>
  );
}
