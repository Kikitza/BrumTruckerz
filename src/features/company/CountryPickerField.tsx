// Picker države iz ISO šifarnika, sa pretragom. value = kod (2 slova) | null.
// Koristi ga naručilac, vinjeta (needs_country rok), čarobnjak nove firme.
import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { ModalScaffold } from "../../components/form";
import { listCountries, type Country } from "./api";

export function CountryPickerField({
  label, value, onSelect, allowClear = true,
}: {
  label: string;
  value: string | null;
  onSelect: (code: string | null) => void;
  allowClear?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = useQuery({ queryKey: ["countries"], queryFn: listCountries });
  const all = q.data ?? [];

  const name = (c: Country) => t(c.name_key);
  const shown = value ? (all.find((c) => c.code === value)) : null;
  const shownLabel = shown ? `${name(shown)} (${shown.code})` : null;

  const ql = query.trim().toLowerCase();
  const filtered = ql
    ? all.filter((c) => name(c).toLowerCase().includes(ql) || c.code.toLowerCase().includes(ql))
    : all;

  const pick = (code: string | null) => { onSelect(code); setOpen(false); setQuery(""); };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Pressable onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, backgroundColor: colors.surface }}>
        <Text style={{ color: shownLabel ? colors.text : colors.textMuted }}>{shownLabel ?? t("country.select")}</Text>
      </Pressable>

      {open && (
        <ModalScaffold colors={colors} onRequestClose={() => setOpen(false)}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}><Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text></Pressable>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{label}</Text>
            <View style={{ width: 48 }} />
          </View>
          <View style={{ padding: 12 }}>
            <TextInput value={query} onChangeText={setQuery} placeholder={t("country.search")} autoFocus
              placeholderTextColor={colors.textMuted}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.text, backgroundColor: colors.surface }} />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={allowClear && value ? (
              <Pressable onPress={() => pick(null)} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textMuted }}>{t("country.none")}</Text>
              </Pressable>
            ) : null}
            renderItem={({ item }) => (
              <PickRow code={item.code} label={name(item)} selected={item.code === value} colors={colors} onPress={() => pick(item.code)} />
            )}
          />
        </ModalScaffold>
      )}
    </View>
  );
}

function PickRow({ code, label, selected, colors, onPress }: { code: string; label: string; selected: boolean; colors: Palette; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: selected ? colors.primary : colors.text }}>{label}</Text>
      <Text style={{ color: colors.textMuted }}>{code}</Text>
    </Pressable>
  );
}
