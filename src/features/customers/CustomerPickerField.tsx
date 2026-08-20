// Picker naručioca za turu: aktivni naručioci + „Bez naručioca" (očisti) + prečica
// „Nov naručilac" (otvara formu; po kreiranju odmah bira novog). Vozač ovo NE vidi
// (koristi se samo na owner/office ekranima ture).
import { useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { ModalScaffold } from "../../components/form";
import { listActiveCustomers, type Customer } from "./api";
import { CustomerFormModal } from "./CustomerFormModal";

export function CustomerPickerField({
  value, valueName, onSelect,
}: {
  value: string | null;
  valueName?: string | null; // ime izabranog (za prikaz i kad je arhiviran/van aktivne liste)
  onSelect: (id: string | null) => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const q = useQuery({ queryKey: ["customers", "active"], queryFn: listActiveCustomers });
  const active = q.data ?? [];
  const shownName = value ? (valueName ?? active.find((c) => c.id === value)?.name ?? "…") : null;

  const pick = (id: string | null) => { onSelect(id); setOpen(false); };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("trip.fields.customer")}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, backgroundColor: colors.surface }}
      >
        <Text style={{ color: shownName ? colors.text : colors.textMuted }}>
          {shownName ?? t("trip.fields.customerNone")}
        </Text>
      </Pressable>

      {open && (
        <ModalScaffold colors={colors} onRequestClose={() => setOpen(false)}>
          <Header title={t("trip.fields.customer")} onClose={() => setOpen(false)} colors={colors} />
          <FlatList
            data={active}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={
              <View>
                <PickRow label={t("trip.fields.customerNone")} muted={value != null} colors={colors} onPress={() => pick(null)} />
                <Pressable onPress={() => setCreating(true)} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>+ {t("customers.new")}</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }: { item: Customer }) => (
              <PickRow
                label={item.vat_number ? `${item.name} · ${item.vat_number}` : item.name}
                selected={item.id === value}
                colors={colors}
                onPress={() => pick(item.id)}
              />
            )}
            ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: 16 }}>{t("customers.empty")}</Text>}
          />
          {creating && (
            <CustomerFormModal
              customer={null}
              onClose={() => setCreating(false)}
              onSaved={(c) => { setCreating(false); pick(c.id); }}
            />
          )}
        </ModalScaffold>
      )}
    </View>
  );
}

function Header({ title, onClose, colors }: { title: string; onClose: () => void; colors: Palette }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
      <Pressable onPress={onClose} hitSlop={8}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
      </Pressable>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{title}</Text>
      <View style={{ width: 48 }} />
    </View>
  );
}

function PickRow({
  label, selected, muted, onPress, colors,
}: { label: string; selected?: boolean; muted?: boolean; onPress: () => void; colors: Palette }) {
  return (
    <Pressable onPress={onPress} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: selected ? colors.primary : muted ? colors.textMuted : colors.text }}>{label}</Text>
    </Pressable>
  );
}
