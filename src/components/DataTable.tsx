// Reusable tabela (F3, SAMO web-širok ekran). Ispod ~900px i na native-u ekrani ostaju kartice 1:1
// (pozivalac granija po isWeb + širini). Zaglavlje kolona, red sa hover-om, klik na red → postojeći
// detalj/modal. Sortiranje v1 samo za kolone koje daju `sort` (trivijalno — datum/naziv).
import { type ReactNode, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../lib/theme";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;   // string → tekst; ReactNode → custom (npr. bedž)
  width?: number;                  // flex-težina (default 1)
  align?: "left" | "right";
  sort?: (row: T) => string | number; // ako postoji → kolona je sortabilna
};

export function DataTable<T>({
  columns, rows, keyExtractor, onRowPress,
}: {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
}) {
  const { colors } = useTheme();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [asc, setAsc] = useState(true);

  let data = rows;
  const sortCol = sortKey ? columns.find((c) => c.key === sortKey) : null;
  if (sortCol?.sort) {
    const f = sortCol.sort;
    data = [...rows].sort((a, b) => { const av = f(a), bv = f(b); return av < bv ? -1 : av > bv ? 1 : 0; });
    if (!asc) data.reverse();
  }

  const onHeader = (c: Column<T>) => {
    if (!c.sort) return;
    if (sortKey === c.key) setAsc((v) => !v);
    else { setSortKey(c.key); setAsc(true); }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface }}>
      <View style={{ flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }}>
        {columns.map((c) => (
          <Pressable key={c.key} onPress={() => onHeader(c)}
            style={{ flex: c.width ?? 1, paddingHorizontal: 10, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: c.align === "right" ? "flex-end" : "flex-start" }}>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" }}>{c.header}</Text>
            {c.sort && sortKey === c.key ? <Text style={{ color: colors.textMuted, fontSize: 10 }}>{asc ? "▲" : "▼"}</Text> : null}
          </Pressable>
        ))}
      </View>

      {data.map((row) => (
        <Pressable key={keyExtractor(row)} onPress={() => onRowPress?.(row)}
          style={(s: { pressed: boolean; hovered?: boolean }) => ({
            flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border,
            backgroundColor: s.hovered ? colors.bg : colors.surface,
          })}>
          {columns.map((c) => {
            const content = c.render(row);
            return (
              <View key={c.key} style={{ flex: c.width ?? 1, paddingHorizontal: 10, justifyContent: "center", alignItems: c.align === "right" ? "flex-end" : "flex-start" }}>
                {typeof content === "string" || typeof content === "number"
                  ? <Text numberOfLines={1} style={{ color: colors.text, fontSize: 14 }}>{content}</Text>
                  : content}
              </View>
            );
          })}
        </Pressable>
      ))}

      {data.length === 0 ? <Text style={{ color: colors.textMuted, textAlign: "center", padding: 20 }}>—</Text> : null}
    </View>
  );
}
