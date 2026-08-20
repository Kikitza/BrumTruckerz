// Ture (vlasnik): AKTIVNE gore + sklopiva „Arhiva" (završene ture — status 'finished').
// Modali su izdvojeni u src/features/trips/ (NE u ovaj folder — expo-router bi ih pretvorio u rute).
// Vlasnik radi ONLINE kroz src/features/trips/api.ts. Boje iz tokena, stringovi kroz t().
// Grupisanje na klijentu (bez izmena baze/upita) po deljenom predikatu isTripArchived.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../../src/lib/theme";
import { useWideWeb } from "../../../src/lib/platform";
import { fmtDate, fmtMoney } from "../../../src/lib/format";
import { DesktopContainer } from "../../../src/components/DesktopContainer";
import { DataTable, type Column } from "../../../src/components/DataTable";
import { LoadMore } from "../../../src/components/LoadMore";
import { ownerListActiveTrips, ownerListArchivedTrips, ownerListTripsRich, tripTitle, type TripListItem, type TripRichRow } from "../../../src/features/trips/api";
import { NewTripModal } from "../../../src/features/trips/NewTripModal";
import { TripDetailModal } from "../../../src/features/trips/TripDetailModal";

type ModalState = { mode: "none" | "new" | "detail"; tripId?: string };
const PAGE = 50;

export default function OwnerTrips() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalState>({ mode: "none" });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const wide = useWideWeb();

  // Server paginacija (F3): aktivne / arhiva / web-tabela svaka raste svoj limit po 50.
  const [activeShown, setActiveShown] = useState(PAGE);
  const [archiveShown, setArchiveShown] = useState(PAGE);
  const [tableShown, setTableShown] = useState(PAGE);

  const activeQ = useQuery({ queryKey: ["owner-trips-active", activeShown], queryFn: () => ownerListActiveTrips(activeShown), enabled: !wide });
  const archiveQ = useQuery({ queryKey: ["owner-trips-archive", archiveShown], queryFn: () => ownerListArchivedTrips(archiveShown), enabled: !wide && archiveOpen });
  const tripsRich = useQuery({ queryKey: ["owner-trips-rich", tableShown], queryFn: () => ownerListTripsRich(tableShown), enabled: wide });

  const active = activeQ.data ?? [];
  const archive = archiveQ.data ?? [];

  const open = (tripId: string) => setModal({ mode: "detail", tripId });

  const modals = (
    <>
      {modal.mode === "new" && <NewTripModal onClose={() => setModal({ mode: "none" })} />}
      {modal.mode === "detail" && modal.tripId && (
        <TripDetailModal tripId={modal.tripId} onClose={() => setModal({ mode: "none" })} />
      )}
    </>
  );

  // WEB širok (F3): desktop tabela.
  if (wide) {
    const cols: Column<TripRichRow>[] = [
      { key: "route", header: t("trip.table.route"), width: 2, render: (r) => tripTitle(r.origin, r.destination) ?? r.id.slice(0, 8), sort: (r) => r.origin ?? "" },
      { key: "customer", header: t("trip.fields.customer"), width: 1.5, render: (r) => r.customer?.name ?? "—", sort: (r) => r.customer?.name ?? "" },
      { key: "driver", header: t("trip.fields.driver"), width: 1.3, render: (r) => r.driver?.full_name ?? "—" },
      { key: "vehicle", header: t("trip.fields.vehicle"), width: 1, render: (r) => r.vehicle?.registration ?? "—" },
      { key: "status", header: t("trip.table.status"), width: 1, render: (r) => t(`trip.status.${r.status}`) },
      { key: "revenue", header: t("trip.table.revenue"), width: 1, align: "right", render: (r) => (r.revenue != null ? fmtMoney(r.revenue, "EUR") : "—") },
      { key: "date", header: t("trip.table.date"), width: 1, align: "right", render: (r) => fmtDate(r.finished_at ?? r.started_at ?? r.created_at), sort: (r) => r.finished_at ?? r.started_at ?? r.created_at },
    ];
    return (
      <DesktopContainer maxWidth={1240}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Pressable onPress={() => setModal({ mode: "new" })} style={{ alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 }}>
            <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("trip.newTrip")}</Text>
          </Pressable>
          {tripsRich.isLoading ? <ActivityIndicator color={colors.primary} /> : (
            <>
              <DataTable columns={cols} rows={tripsRich.data ?? []} keyExtractor={(r) => r.id} onRowPress={(r) => open(r.id)} />
              {(tripsRich.data?.length ?? 0) >= tableShown ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={() => setTableShown((n) => n + PAGE)} /> : null}
            </>
          )}
        </ScrollView>
        {modals}
      </DesktopContainer>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 12 }}>
        <Pressable
          onPress={() => setModal({ mode: "new" })}
          style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center" }}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: "600" }}>{t("trip.newTrip")}</Text>
        </Pressable>
      </View>

      {activeQ.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* AKTIVNE (server paginacija) */}
          <SectionLabel colors={colors} text={t("trip.active")} />
          {active.length === 0 ? (
            <Text style={{ color: colors.textMuted, paddingHorizontal: 16, paddingVertical: 12 }}>
              {t("trip.noActiveTrips")}
            </Text>
          ) : (
            <>
              {active.map((item) => <TripRow key={item.id} item={item} colors={colors} onPress={() => open(item.id)} />)}
              {active.length >= activeShown ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={() => setActiveShown((n) => n + PAGE)} /> : null}
            </>
          )}

          {/* ARHIVA (sklopiva, server paginacija — učitava se tek na otvaranje) */}
          <Pressable
            onPress={() => setArchiveOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: archiveOpen }}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}
          >
            <Text style={{ color: colors.textMuted, width: 14, fontSize: 12 }}>{archiveOpen ? "▾" : "▸"}</Text>
            <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 13 }}>{t("trip.archive")}</Text>
          </Pressable>
          {archiveOpen && (archiveQ.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
          ) : (
            <>
              {archive.map((item) => <TripRow key={item.id} item={item} colors={colors} onPress={() => open(item.id)} />)}
              {archive.length >= archiveShown ? <LoadMore colors={colors} label={t("common.loadMore")} onPress={() => setArchiveShown((n) => n + PAGE)} /> : null}
            </>
          ))}
        </ScrollView>
      )}

      {modals}
    </View>
  );
}

function SectionLabel({ colors, text }: { colors: Palette; text: string }) {
  return (
    <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 13, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
      {text}
    </Text>
  );
}

// Red ture (isti izgled za aktivne i arhivu) — otvara detalj (troškovi/dokumenti/istorija).
function TripRow({ item, colors, onPress }: { item: TripListItem; colors: Palette; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      <Text style={{ color: colors.text, fontWeight: "600" }}>
        {tripTitle(item.origin, item.destination) ?? item.title ?? item.id.slice(0, 8)}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 2 }}>{t(`trip.status.${item.status}`)}</Text>
    </Pressable>
  );
}
