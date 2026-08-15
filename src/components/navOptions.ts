// Deljene, teme-svesne opcije za Tabs (header + tab bar) — JEDNO mesto za owner i
// driver (bez ad-hoc stilova po ekranu). Header je NEPROVIDAN (themed) pa mu
// react-navigation dodaje gornji safe-area inset — naslov i headerRight (zastavica)
// ne ulaze pod statusnu traku. Tab bar poštuje donji inset (home indikator) automatski.
import { useTheme } from "../lib/theme";

export function useTabsScreenOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
    headerShadowVisible: false,
    sceneContainerStyle: { backgroundColor: colors.bg },
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
  };
}
