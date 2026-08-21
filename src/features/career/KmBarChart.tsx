// Jednostavan bar-grafikon km po mesecu za izabranu godinu (bez teške zavisnosti — čisti View-ovi).
// Radi na native i web. Prazne godine se ljubazno ispisuju.
import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { Palette } from "../../lib/theme";
import { fmtKm } from "../../lib/format";
import { availableYears, kmByMonthForYear } from "./calc";
import type { CareerKmPoint } from "./api";

const CHART_H = 120;

export function KmBarChart({
  series, colors, t,
}: { series: CareerKmPoint[]; colors: Palette; t: (k: string, o?: Record<string, unknown>) => string }) {
  const years = availableYears(series);
  const [picked, setPicked] = useState<number | null>(null);

  if (years.length === 0) {
    return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("career.chart.empty")}</Text>;
  }

  const year = picked != null && years.includes(picked) ? picked : years[0];
  const data = kmByMonthForYear(series, year);
  const max = Math.max(1, ...data);
  const idx = years.indexOf(year);

  return (
    <View style={{ gap: 10 }}>
      {/* Prebacivač godina (samo ako ima više od jedne) */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("career.chart.title")}</Text>
        {years.length > 1 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => setPicked(years[Math.min(idx + 1, years.length - 1)])} hitSlop={8} disabled={idx >= years.length - 1}>
              <Text style={{ color: idx >= years.length - 1 ? colors.textMuted : colors.primary, fontSize: 18, fontWeight: "700" }}>‹</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{year}</Text>
            <Pressable onPress={() => setPicked(years[Math.max(idx - 1, 0)])} hitSlop={8} disabled={idx <= 0}>
              <Text style={{ color: idx <= 0 ? colors.textMuted : colors.primary, fontSize: 18, fontWeight: "700" }}>›</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ color: colors.text, fontWeight: "700" }}>{year}</Text>
        )}
      </View>

      {/* Stubovi */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: CHART_H, gap: 3 }}>
        {data.map((v, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: CHART_H }}>
            <View
              style={{
                width: "100%",
                height: Math.max(v > 0 ? 3 : 0, Math.round((v / max) * (CHART_H - 4))),
                backgroundColor: v > 0 ? colors.primary : "transparent",
                borderRadius: 3,
              }}
            />
          </View>
        ))}
      </View>
      {/* Oznake meseci (1..12) */}
      <View style={{ flexDirection: "row", gap: 3 }}>
        {data.map((_, i) => (
          <Text key={i} style={{ flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 9 }}>{i + 1}</Text>
        ))}
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {t("career.chart.yearTotal", { km: fmtKm(data.reduce((a, b) => a + b, 0)) })}
      </Text>
    </View>
  );
}
