// Deljene form primitive za modale (fleet + trips).
//
// VAŽNO (BUG 1): ove komponente MORAJU biti na MODULE nivou (stabilan identitet).
// Ako se komponenta sa TextInput-om definiše UNUTAR render-a roditelja, React je
// tretira kao novi tip na svaki render → remount TextInput-a → tastatura se zatvara
// posle svakog karaktera. Zato Field/ModalScaffold žive ovde, van komponenti.
//
// BUG 2: ModalScaffold umotava sadržaj u KeyboardAvoidingView (iOS "padding") i
// dodaje safe-area padding na vrhu (status bar / sat / baterija) da dugmad u
// headeru budu ispod status bara i tapabilna.
import { type ReactNode, useState } from "react";
import { View, Text, TextInput, Modal, KeyboardAvoidingView, Platform, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { Palette } from "../lib/theme";
import { fmtDate } from "../lib/format";

export function Field({
  label, value, onChangeText, keyboardType, placeholder, autoCapitalize, colors,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
  autoCapitalize?: "none" | "characters" | "sentences";
  colors: Palette;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? "default"}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize={autoCapitalize}
        style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: 12, color: colors.text, backgroundColor: colors.surface,
        }}
      />
    </View>
  );
}

// Lokalni datum -> "YYYY-MM-DD" (bazne date kolone; ne diramo vremensku zonu).
const pad = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Datumsko polje kroz NATIVNI kalendar (tap -> picker). Vrednost je "YYYY-MM-DD" | null,
// prikaz kroz fmtDate (lokalizovano). iOS: inline picker + "Gotovo"; Android: sistemski dijalog.
export function DateField({
  label, value, onChange, colors, placeholder, clearable = true,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  colors: Palette;
  placeholder?: string;
  clearable?: boolean;
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const current = value ? new Date(`${value}T00:00:00`) : new Date();

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== "ios") setShow(false); // Android dijalog se sam zatvara
    if (event.type === "dismissed") return;
    if (selected) onChange(toYMD(selected));
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          onPress={() => setShow(true)}
          style={{
            flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
            padding: 12, backgroundColor: colors.surface,
          }}
        >
          <Text style={{ color: value ? colors.text : colors.textMuted }}>
            {value ? fmtDate(value) : (placeholder ?? "—")}
          </Text>
        </Pressable>
        {clearable && value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={8} style={{ padding: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 18 }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {show && Platform.OS !== "ios" && (
        <DateTimePicker value={current} mode="date" onChange={handleChange} />
      )}
      {show && Platform.OS === "ios" && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginTop: 4 }}>
          <DateTimePicker value={current} mode="date" display="inline" onChange={handleChange} />
          <Pressable onPress={() => setShow(false)} style={{ padding: 12, alignItems: "flex-end" }}>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>{t("common.done")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Custom rokovi ("Ostali rokovi") — reusable, kontrolisana lista ──
// Ne priča sa API-jem; roditelj drži niz nacrta i snima ga (saveCustomReminders).
// Namerno reusable: kasnije ide i na formu vozača.
export type CustomReminderDraft = {
  key: string; // stabilan UI ključ (React liste)
  existingId: string | null; // id u bazi ako je već sačuvan, inače null
  label: string;
  dueDate: string | null;
  issuedAt: string | null;
};

let draftSeq = 0;
export const newCustomDraft = (): CustomReminderDraft => ({
  key: `new-${draftSeq++}`,
  existingId: null,
  label: "",
  dueDate: null,
  issuedAt: null,
});

export function CustomRemindersSection({
  title, addLabel, nameLabel, validUntilLabel, fromLabel, items, onChange, colors,
}: {
  title: string;
  addLabel: string;
  nameLabel: string;
  validUntilLabel: string;
  fromLabel: string;
  items: CustomReminderDraft[];
  onChange: (next: CustomReminderDraft[]) => void;
  colors: Palette;
}) {
  const update = (key: string, patch: Partial<CustomReminderDraft>) =>
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string) => onChange(items.filter((i) => i.key !== key));

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{title}</Text>

      {items.map((it) => (
        <View
          key={it.key}
          style={{
            gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
            padding: 12, backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Pressable onPress={() => remove(it.key)} hitSlop={8} style={{ padding: 4 }}>
              <Text style={{ color: colors.danger, fontSize: 20, lineHeight: 20 }}>×</Text>
            </Pressable>
          </View>
          <Field
            label={nameLabel}
            value={it.label}
            onChangeText={(s) => update(it.key, { label: s })}
            autoCapitalize="sentences"
            colors={colors}
          />
          <DateField
            label={validUntilLabel}
            value={it.dueDate}
            onChange={(v) => update(it.key, { dueDate: v })}
            colors={colors}
            placeholder="—"
          />
          <DateField
            label={fromLabel}
            value={it.issuedAt}
            onChange={(v) => update(it.key, { issuedAt: v })}
            colors={colors}
            placeholder="—"
          />
        </View>
      ))}

      <Pressable
        onPress={() => onChange([...items, newCustomDraft()])}
        style={{
          borderWidth: 1, borderStyle: "dashed", borderColor: colors.primary,
          borderRadius: 8, padding: 12, alignItems: "center",
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: "600" }}>{addLabel}</Text>
      </Pressable>
    </View>
  );
}

// Padajući izbor kroz slide modal (vozač/vlasnik dele isti UI). Samo tokeni.
// value=null -> prikazuje placeholder; clearLabel (opciono) nudi „očisti" stavku.
export function PickerField({
  label, value, options, placeholder, clearLabel, onSelect, colors,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  placeholder: string;
  clearLabel?: string;
  onSelect: (v: string | null) => void;
  colors: Palette;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: 12, backgroundColor: colors.surface,
        }}
      >
        <Text style={{ color: current ? colors.text : colors.textMuted }}>
          {current ? current.label : placeholder}
        </Text>
      </Pressable>

      {open && (
        <ModalScaffold colors={colors} onRequestClose={() => setOpen(false)}>
          <View
            style={{
              flexDirection: "row", justifyContent: "space-between", alignItems: "center",
              padding: 16, borderBottomWidth: 1, borderColor: colors.border,
            }}
          >
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>{t("common.cancel")}</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{label}</Text>
            <View style={{ width: 48 }} />
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            ListHeaderComponent={
              clearLabel ? (
                <Pressable
                  onPress={() => { onSelect(null); setOpen(false); }}
                  style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: value == null ? colors.primary : colors.textMuted }}>
                    {clearLabel}
                  </Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect(item.value); setOpen(false); }}
                style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: item.value === value ? colors.primary : colors.text }}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </ModalScaffold>
      )}
    </View>
  );
}

// Omotač za SVE modale: Modal + KeyboardAvoidingView + safe-area (top).
export function ModalScaffold({
  colors, onRequestClose, children,
}: {
  colors: Palette;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <View style={{ flex: 1, paddingTop: insets.top }}>{children}</View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
