// Reusable sklopiva sekcija (accordion): zaglavlje sa strelicom + opcioni „right"
// sadržaj (npr. semafor-sažetak), telo se prikazuje kad je otvoreno.
// Koriste je: Rokovi (sekcije po subjektu) i Detalj ture (sekcije).
import { useState, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import type { Palette } from "../lib/theme";

export function Collapsible({
  title, colors, defaultOpen = false, right, accessibilityLabel, children,
}: {
  title: string;
  colors: Palette;
  defaultOpen?: boolean;
  right?: ReactNode; // npr. semafor-sažetak; uvek vidljiv, i kad je sklopljeno
  accessibilityLabel?: string; // opis za čitač ekrana (npr. sažetak sekcije)
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={accessibilityLabel}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}
      >
        <Text style={{ color: colors.textMuted, width: 14, fontSize: 12 }}>{open ? "▾" : "▸"}</Text>
        <Text style={{ flex: 1, color: colors.text, fontWeight: "700", fontSize: 15 }}>{title}</Text>
        {right}
      </Pressable>
      {open && <View style={{ paddingBottom: 6 }}>{children}</View>}
    </View>
  );
}
