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
import { View, Text, TextInput, Modal, KeyboardAvoidingView, Platform, Pressable } from "react-native";
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
