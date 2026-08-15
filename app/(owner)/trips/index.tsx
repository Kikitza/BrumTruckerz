// Ture (vlasnik): AKTIVNE gore + sklopiva „Arhiva" (završene ture — status 'finished').
// Modali su izdvojeni u src/features/trips/ (NE u ovaj folder — expo-router bi ih pretvorio u rute).
// Vlasnik radi ONLINE kroz src/features/trips/api.ts. Boje iz tokena, stringovi kroz t().
// Grupisanje na klijentu (bez izmena baze/upita) po deljenom predikatu isTripArchived.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme, type Palette } from "../../../src/lib/theme";
import { ownerListTrips, tripTitle, isTripArchived, type TripListItem } from "../../../src/features/trips/api";
import { NewTripModal } from "../../../src/features/trips/NewTripModal";
import { TripDetailModal } from "../../../src/features/trips/TripDetailModal";

type ModalState = { mode: "none" | "new" | "detail"; tripId?: string };
const ARCHIVE_PAGE = 20;

export default function OwnerTrips() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalState>({ mode: "none" });
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveShown, setArchiveShown] = useState(ARCHIVE_PAGE);

  const trips = useQuery({ queryKey: ["owner-trips"], queryFn: ownerListTrips });

  // Upit vraća sortirano po created_at desc (najnovije prvo) — podela čuva taj redosled.
  const all = trips.data ?? [];
  const active = all.filter((x) => !isTripArchived(x));
  const archive = all.filter((x) => isTripArchived(x));

  const open = (tripId: string) => setModal({ mode: "detail", tripId });

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

      {trips.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          {/* AKTIVNE */}
          <SectionLabel colors={colors} text={t("trip.active")} />
          {active.length === 0 ? (
            <Text style={{ color: colors.textMuted, paddingHorizontal: 16, paddingVertical: 12 }}>
              {t("trip.noActiveTrips")}
            </Text>
          ) : (
            active.map((item) => <TripRow key={item.id} item={item} colors={colors} onPress={() => open(item.id)} />)
          )}

          {/* ARHIVA (sklopiva) — prikaz samo ako ima arhiviranih */}
          {archive.length > 0 && (
            <>
              <Pressable
                onPress={() => setArchiveOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: archiveOpen }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}
              >
                <Text style={{ color: colors.textMuted, width: 14, fontSize: 12 }}>{archiveOpen ? "▾" : "▸"}</Text>
                <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: 13 }}>
                  {t("trip.archive")} ({archive.length})
                </Text>
              </Pressable>

              {archiveOpen && (
                <>
                  {archive.slice(0, archiveShown).map((item) => (
                    <TripRow key={item.id} item={item} colors={colors} onPress={() => open(item.id)} />
                  ))}
                  {archiveShown < archive.length && (
                    <Pressable
                      onPress={() => setArchiveShown((n) => n + ARCHIVE_PAGE)}
                      style={{ margin: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: "600" }}>{t("trip.loadMore")}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {modal.mode === "new" && <NewTripModal onClose={() => setModal({ mode: "none" })} />}
      {modal.mode === "detail" && modal.tripId && (
        <TripDetailModal tripId={modal.tripId} onClose={() => setModal({ mode: "none" })} />
      )}
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
