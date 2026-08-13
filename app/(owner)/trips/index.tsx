// Lista tura (vlasnik). P&L detalj -> korak 6 iz CLAUDE.md.
import { View, Text, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ownerListTrips } from "../../../src/features/trips/api";
import { useTheme } from "../../../src/lib/theme";

export default function OwnerTrips() {
  const { colors } = useTheme();
  const { data } = useQuery({ queryKey: ["owner-trips"], queryFn: ownerListTrips });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
            <Text style={{ color: colors.text, fontWeight: "600" }}>{item.title ?? item.id.slice(0, 8)}</Text>
            <Text style={{ color: colors.textMuted }}>{item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}
