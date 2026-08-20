// Deljena forma za unos troška — koristi je i vlasnik (online) i vozač (offline red).
// Sama vodi lokalni state i validaciju; onSubmit prima GOTOVE vrednosti i persistuje
// ih (roditelj bira putanju: ownerAddExpense vs addExpense/enqueue). Na uspeh reset,
// na grešku (throw iz onSubmit) unos ostaje.  KVALITET KODA: jedna forma, bez dupliranja.
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import type { Palette } from "../../lib/theme";
import { Field, DateField, PickerField } from "../../components/form";
import { toNum } from "../../lib/num";
import { CURRENCIES } from "../../lib/currencies";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./api";

const pad = (n: number) => String(n).padStart(2, "0");
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export type ExpenseFormValues = {
  category: ExpenseCategory;
  original_amount: number;
  original_currency: string;
  occurred_at: string; // 'YYYY-MM-DD'
  liters: number | null;
  country: string | null;
  note: string | null;
};

export function ExpenseForm({
  colors, onSubmit,
}: {
  colors: Palette;
  onSubmit: (v: ExpenseFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<ExpenseCategory>("fuel");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState<string | null>(todayYMD());
  const [liters, setLiters] = useState("");
  const [country, setCountry] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amountNum = toNum(amount);
  const canSubmit = amountNum != null && !busy;

  const submit = async () => {
    if (amountNum == null) return;
    setBusy(true);
    try {
      await onSubmit({
        category,
        original_amount: amountNum,
        original_currency: currency,
        occurred_at: date ?? todayYMD(),
        liters: category === "fuel" ? toNum(liters) : null,
        country: country.trim() || null,
        note: note.trim() || null,
      });
      // reset ulaznih polja (kategorija/valuta/datum ostaju za sledeći unos)
      setAmount(""); setLiters(""); setCountry(""); setNote("");
    } catch {
      // roditelj prikazuje grešku; zadrži unos da se ne izgubi
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("expense.category")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {EXPENSE_CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <Pressable key={c} onPress={() => setCategory(c)}
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
      <Field label={t("expense.amount")} value={amount} onChangeText={setAmount}
        keyboardType="numeric" placeholder="0.00" colors={colors} />
      <PickerField label={t("expense.currency")} value={currency}
        options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        placeholder={t("trip.select")} onSelect={(v) => setCurrency(v ?? "EUR")} colors={colors} />
      <DateField label={t("expense.date")} value={date} onChange={setDate}
        colors={colors} placeholder="—" clearable={false} />
      {category === "fuel" ? (
        <Field label={t("expense.liters")} value={liters} onChangeText={setLiters}
          keyboardType="numeric" placeholder="0.0" colors={colors} />
      ) : null}
      <Field label={t("expense.country")} value={country} onChangeText={setCountry}
        autoCapitalize="characters" placeholder="DE" colors={colors} />
      <Field label={t("expense.note")} value={note} onChangeText={setNote} colors={colors} />
      <Pressable onPress={submit} disabled={!canSubmit}
        style={{
          backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center",
          opacity: canSubmit ? 1 : 0.6,
        }}>
        <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>
          {busy ? t("common.saving") : t("expense.add")}
        </Text>
      </Pressable>
    </View>
  );
}
