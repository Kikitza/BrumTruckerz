// Modal „Nov/Izmeni naručilac" (REVERZIBILNOST #2: forma sa postojećim vrednostima).
// Sav pristup bazi kroz customers/api.ts. Boje iz tokena, stringovi kroz t().
import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { Field, ModalScaffold } from "../../components/form";
import { toInt } from "../../lib/num";
import { createCustomer, updateCustomer, type Customer, type CustomerInput } from "./api";

export function CustomerFormModal({
  customer, onClose, onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved?: (c: Customer) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const editing = customer != null;

  const [name, setName] = useState(customer?.name ?? "");
  const [vat, setVat] = useState(customer?.vat_number ?? "");
  const [country, setCountry] = useState(customer?.country_code ?? "");
  const [email, setEmail] = useState(customer?.contact_email ?? "");
  const [phone, setPhone] = useState(customer?.contact_phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [terms, setTerms] = useState(customer?.payment_terms_days != null ? String(customer.payment_terms_days) : "30");
  const [note, setNote] = useState(customer?.note ?? "");

  const save = useMutation({
    mutationFn: () => {
      const input: CustomerInput = {
        name, vat_number: vat, country_code: country, contact_email: email,
        contact_phone: phone, address, payment_terms_days: toInt(terms) ?? 30, note,
      };
      return editing ? updateCustomer(customer!.id, input) : createCustomer(input);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      onSaved?.(c);
      onClose();
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

  const valid = name.trim().length > 0 && !save.isPending;

  return (
    <ModalScaffold colors={colors} onRequestClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
          {t(editing ? "customers.edit" : "customers.new")}
        </Text>
        <Pressable onPress={() => save.mutate()} disabled={!valid} hitSlop={8}>
          <Text style={{ color: valid ? colors.primary : colors.textMuted, fontWeight: "700", fontSize: 16 }}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Field label={t("customers.fields.name")} value={name} onChangeText={setName} autoCapitalize="sentences" colors={colors} />
        <Field label={t("customers.fields.vatNumber")} value={vat} onChangeText={setVat} autoCapitalize="characters" colors={colors} />
        <Field label={t("customers.fields.countryCode")} value={country} onChangeText={setCountry} autoCapitalize="characters" placeholder="RS" colors={colors} />
        <Field label={t("customers.fields.paymentTerms")} value={terms} onChangeText={setTerms} keyboardType="numeric" placeholder="30" colors={colors} />
        <Field label={t("customers.fields.contactEmail")} value={email} onChangeText={setEmail} autoCapitalize="none" colors={colors} />
        <Field label={t("customers.fields.contactPhone")} value={phone} onChangeText={setPhone} autoCapitalize="none" colors={colors} />
        <Field label={t("customers.fields.address")} value={address} onChangeText={setAddress} autoCapitalize="sentences" colors={colors} />
        <Field label={t("customers.fields.note")} value={note} onChangeText={setNote} autoCapitalize="sentences" colors={colors} />
      </ScrollView>
    </ModalScaffold>
  );
}
