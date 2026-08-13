// Aktivna tura (vozač): status dugmad -> offline red -> RPC. Radi i bez mreže.
import { View, Text, Pressable, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { driverListTrips, driverAddEvent, driverProgress } from "../../src/features/trips/api";
import { useTheme } from "../../src/lib/theme";

const STATUSES = ["loading", "driving", "border", "unloading", "finished"] as const;

export default function DriverHome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data } = useQuery({ queryKey: ["driver-trips"], queryFn: driverListTrips });
  const active = data?.find((x: any) => x.status !== "finished");

  const setStatus = async (s: string) => {
    if (!active) return;
    await driverAddEvent({ company_id: active.company_id, trip_id: active.id, type: s === "driving" ? "driving" : s === "border" ? "border" : s === "loading" ? "load" : s === "unloading" ? "unload" : "other" });
    await driverProgress({ trip_id: active.id, status: s });
  };

  if (!active) return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}><Text style={{ color: colors.textMuted }}>—</Text></View>;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{active.title ?? active.id.slice(0, 8)}</Text>
      <Text style={{ color: colors.textMuted }}>{t(`trip.status.${active.status}`, active.status)}</Text>
      <FlatList
        data={[...STATUSES]}
        keyExtractor={(s) => s}
        renderItem={({ item }) => (
          <Pressable onPress={() => setStatus(item)}
            style={{ padding: 14, marginVertical: 4, borderRadius: 8, backgroundColor: item === active.status ? colors.primary : colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: item === active.status ? "#fff" : colors.text }}>{t(`trip.status.${item}`)}</Text>
          </Pressable>
        )}
      />
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("common.offlineNote")}</Text>
    </View>
  );
}
