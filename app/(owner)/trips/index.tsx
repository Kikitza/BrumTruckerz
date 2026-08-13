// Ture (vlasnik): lista + navigacija ka „Nova tura" / „Detalj ture".
// Modali su izdvojeni u src/features/trips/ (NE u ovaj folder — expo-router bi ih pretvorio u rute).
// Vlasnik radi ONLINE kroz src/features/trips/api.ts. Boje iz tokena, stringovi kroz t().
import { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../src/lib/theme";
import { ownerListTrips, tripTitle } from "../../../src/features/trips/api";
import { NewTripModal } from "../../../src/features/trips/NewTripModal";
import { TripDetailModal } from "../../../src/features/trips/TripDetailModal";

type ModalState = { mode: "none" | "new" | "detail"; tripId?: string };

export default function OwnerTrips() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [modal, setModal] = useState<ModalState>({ mode: "none" });

  const trips = useQuery({ queryKey: ["owner-trips"], queryFn: ownerListTrips });

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
        <FlatList
          data={trips.data ?? []}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setModal({ mode: "detail", tripId: item.id })}
              style={{
                padding: 16, borderBottomWidth: 1, borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {tripTitle(item.origin, item.destination) ?? item.title ?? item.id.slice(0, 8)}
              </Text>
              <Text style={{ color: colors.textMuted, marginTop: 2 }}>
                {t(`trip.status.${item.status}`)}
              </Text>
            </Pressable>
          )}
        />
      )}

      {modal.mode === "new" && <NewTripModal onClose={() => setModal({ mode: "none" })} />}
      {modal.mode === "detail" && modal.tripId && (
        <TripDetailModal tripId={modal.tripId} onClose={() => setModal({ mode: "none" })} />
      )}
    </View>
  );
}
