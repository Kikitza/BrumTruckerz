// „Mreža" (v2-3 kriška 2, ADR 0014) — office (vlasnik + dispečer) pretražuje radnike
// i poziva ih. Desktop-doteran (DesktopContainer). Sva logika u feature komponenti.
import { ScrollView } from "react-native";
import { useTheme } from "../../src/lib/theme";
import { DesktopContainer } from "../../src/components/DesktopContainer";
import { NetworkSearchView } from "../../src/features/network/NetworkSearchView";

export default function NetworkScreen() {
  const { colors } = useTheme();
  return (
    <DesktopContainer>
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 24 }}>
        <NetworkSearchView />
      </ScrollView>
    </DesktopContainer>
  );
}
