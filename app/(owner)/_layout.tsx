import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../../src/i18n/LanguagePicker";
import { useTabsScreenOptions } from "../../src/components/navOptions";

// Zastava trenutnog jezika gore desno na PRVOM ekranu vlasnika (promena u hodu).
// U nativnom headeru (koji poštuje gornji safe-area inset) — ne ulazi pod statusnu traku.
function LanguageHeaderRight() {
  return (
    <View style={{ marginRight: 12 }}>
      <LanguagePicker compact />
    </View>
  );
}

export default function OwnerTabs() {
  const { t } = useTranslation();
  const screenOptions = useTabsScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="trips/index" options={{ title: t("tabs.trips"), headerRight: LanguageHeaderRight }} />
      <Tabs.Screen name="fleet" options={{ title: t("tabs.fleet") }} />
      <Tabs.Screen name="reminders" options={{ title: t("tabs.reminders") }} />
      <Tabs.Screen name="reports" options={{ title: t("tabs.reports") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
