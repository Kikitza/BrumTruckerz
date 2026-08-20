// Modal „Nov/Izmeni naručilac" (REVERZIBILNOST #2: forma sa postojećim vrednostima).
// Sav pristup bazi kroz customers/api.ts. Boje iz tokena, stringovi kroz t().
import { useState } from "react";
import { View, Text, Pressable, ScrollView, Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { Field, ModalScaffold } from "../../components/form";
import { toInt } from "../../lib/num";
import { createCustomer, updateCustomer, checkVat, type Customer, type CustomerInput, type ViesResult } from "./api";
import { isEuVatCountry, viesMessageKey } from "./vies";
import { CountryPickerField } from "../company/CountryPickerField";

type ViesUi = ViesResult | { status: "not_eu" } | null;

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
  const [vies, setVies] = useState<ViesUi>(null);

  // Provera VIES-a: aktivna kad je zemlja EU i PIB unet. customer_id (ako se izmenjuje) →
  // ishod se upisuje na naručioca (badge). Novi naručilac (bez id) → samo prikaz + „Preuzmi naziv".
  const eu = isEuVatCountry(country);
  const canCheck = eu && vat.trim().length > 0;
  const check = useMutation({
    mutationFn: () => {
      if (!eu) return Promise.resolve<ViesUi>({ status: "not_eu" });
      return checkVat({ country_code: country, vat_number: vat, customer_id: editing ? customer!.id : undefined });
    },
    onSuccess: (r) => {
      setVies(r);
      if (editing) qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) => Alert.alert(t("common.error"), String((e as Error).message ?? e)),
  });

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
        <Field label={t("customers.fields.vatNumber")} value={vat} onChangeText={(s) => { setVat(s); setVies(null); }} autoCapitalize="characters" colors={colors} />
        <CountryPickerField label={t("customers.fields.countryCode")} value={country || null} onSelect={(c) => { setCountry(c ?? ""); setVies(null); }} />

        {/* VIES provera PIB-a */}
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => check.mutate()}
            disabled={!canCheck || check.isPending}
            style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", opacity: !canCheck || check.isPending ? 0.5 : 1 }}
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>
              {check.isPending ? t("common.saving") : t("customers.checkVat")}
            </Text>
          </Pressable>
          {!eu && country.trim().length > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("customers.vies.notEu")}</Text>
          )}
          {vies && <ViesResultView vies={vies} currentName={name} onUseName={setName} colors={colors} />}
        </View>
        <Field label={t("customers.fields.paymentTerms")} value={terms} onChangeText={setTerms} keyboardType="numeric" placeholder="30" colors={colors} />
        <Field label={t("customers.fields.contactEmail")} value={email} onChangeText={setEmail} autoCapitalize="none" colors={colors} />
        <Field label={t("customers.fields.contactPhone")} value={phone} onChangeText={setPhone} autoCapitalize="none" colors={colors} />
        <Field label={t("customers.fields.address")} value={address} onChangeText={setAddress} autoCapitalize="sentences" colors={colors} />
        <Field label={t("customers.fields.note")} value={note} onChangeText={setNote} autoCapitalize="sentences" colors={colors} />
      </ScrollView>
    </ModalScaffold>
  );
}

// Prikaz ishoda VIES provere. ✓ validan (+ „Preuzmi naziv" ako se razlikuje);
// ✗ nije pronađen (UPOZORENJE, ne blokira čuvanje); ⚠ servis nedostupan; EU-only poruka.
function ViesResultView({
  vies, currentName, onUseName, colors,
}: { vies: ViesResult | { status: "not_eu" }; currentName: string; onUseName: (n: string) => void; colors: Palette }) {
  const { t } = useTranslation();
  if (vies.status === "valid") {
    const name = "name" in vies ? vies.name : null;
    const nameDiffers = !!name && name.trim() !== currentName.trim();
    return (
      <View style={{ gap: 6, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.primary }}>
        <Text style={{ color: colors.primary, fontWeight: "600" }}>
          ✓ {name ? t("customers.vies.valid", { name }) : t("customers.vies.validNoName")}
        </Text>
        {nameDiffers && (
          <Pressable onPress={() => onUseName(name!)} hitSlop={6} style={{ alignSelf: "flex-start" }}>
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("customers.useName")}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  const color = vies.status === "invalid" ? colors.warn : colors.textMuted;
  const prefix = vies.status === "invalid" ? "✗ " : vies.status === "unavailable" ? "⚠ " : "";
  return <Text style={{ color, fontSize: 13 }}>{prefix}{t(viesMessageKey(vies.status))}</Text>;
}
