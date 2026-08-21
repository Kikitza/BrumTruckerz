// Karijerni profil (CV) — deljeni prikaz. Koristi ga vozačev „Profil" (self, bez zaglavlja),
// dispečerov „Moj CV" i office pregled radnika (kroz modal, sa zaglavljem).
// `userId` = undefined/null → moj CV. Boje iz tokena, stringovi kroz t(), pristup kroz api sloj.
import type { ReactNode } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../lib/theme";
import { fmtKm, fmtNumber } from "../../lib/format";
import {
  getCareerHeader, getCareerSummary, getCareerEmployments, getCareerKmSeries, getCareerCountries,
  type CareerEmployment,
} from "./api";
import { tenureYearsMonths, monthYear, flagEmoji } from "./calc";
import { KmBarChart } from "./KmBarChart";

export function CareerProfileView({ userId, showHeader = false }: { userId?: string | null; showHeader?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const key = userId ?? "me";

  const headerQ = useQuery({ queryKey: ["career-header", key], queryFn: () => getCareerHeader(userId), enabled: showHeader });
  const sumQ = useQuery({ queryKey: ["career-summary", key], queryFn: () => getCareerSummary(userId) });
  const empQ = useQuery({ queryKey: ["career-employments", key], queryFn: () => getCareerEmployments(userId) });
  const kmQ = useQuery({ queryKey: ["career-km", key], queryFn: () => getCareerKmSeries(userId) });
  const ctryQ = useQuery({ queryKey: ["career-countries", key], queryFn: () => getCareerCountries(userId) });

  if (sumQ.isLoading || empQ.isLoading || kmQ.isLoading) {
    return <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />;
  }

  const s = sumQ.data;
  const tenure = tenureYearsMonths(s?.tenure_days ?? 0);
  const tenureText = tenure.years > 0
    ? `${tenure.years}${t("career.yearShort")} ${tenure.months}${t("career.monthShort")}`
    : `${tenure.months}${t("career.monthShort")}`;

  return (
    <View style={{ gap: 14 }}>
      {showHeader && (
        <Card colors={colors}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{headerQ.data?.display_name ?? "—"}</Text>
          <Text selectable style={{ color: colors.textMuted, fontSize: 13 }}>{headerQ.data?.public_no ?? "—"}</Text>
        </Card>
      )}

      {/* Zbirne brojke */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat colors={colors} label={t("career.totalKm")} value={fmtKm(s?.total_km ?? 0)} />
        <Stat colors={colors} label={t("career.trips")} value={fmtNumber(s?.trips_count ?? 0)} />
        <Stat colors={colors} label={t("career.companies")} value={fmtNumber(s?.companies_count ?? 0)} />
        <Stat colors={colors} label={t("career.tenure")} value={tenureText} />
      </View>

      {/* Grafikon km/mesec */}
      <Card colors={colors}>
        <KmBarChart series={kmQ.data ?? []} colors={colors} t={t} />
      </Card>

      {/* Zemlje kroz koje je vozio */}
      <Card colors={colors}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 }}>
          {t("career.countriesVisited")}
        </Text>
        {(ctryQ.data ?? []).length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("career.noCountries")}</Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(ctryQ.data ?? []).map((c) => (
              <View key={c.country_code}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 15 }}>{flagEmoji(c.country_code) || "🏳️"}</Text>
                <Text style={{ color: colors.text, fontSize: 13 }}>{t(c.name_key)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>· {c.trips_count}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Istorija zaposlenja */}
      <Card colors={colors}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 }}>
          {t("career.employmentHistory")}
        </Text>
        {(empQ.data ?? []).length === 0 ? (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("career.noEmployments")}</Text>
        ) : (
          (empQ.data ?? []).map((e, i) => <EmploymentRow key={`${e.company_id}-${e.started_at}-${i}`} e={e} colors={colors} t={t} />)
        )}
      </Card>
    </View>
  );
}

function Card({ colors, children }: { colors: Palette; children: ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 16, gap: 4 }}>
      {children}
    </View>
  );
}

function Stat({ colors, label, value }: { colors: Palette; label: string; value: string }) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: "45%", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 10, padding: 14, gap: 4,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function EmploymentRow({ e, colors, t }: { e: CareerEmployment; colors: Palette; t: (k: string, o?: Record<string, unknown>) => string }) {
  const active = e.status === "active";
  const period = `${monthYear(e.started_at)} – ${active ? t("career.now") : monthYear(e.ended_at)}`;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderColor: colors.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>{e.company_name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{period} · {t(`career.role.${e.role_on_company}`)}</Text>
      </View>
      <Text style={{ color: active ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
        {t(active ? "career.statusActive" : "career.statusEnded")}
      </Text>
    </View>
  );
}
