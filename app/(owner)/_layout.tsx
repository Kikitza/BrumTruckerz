import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../../src/i18n/LanguagePicker";

// Zastava trenutnog jezika gore desno na PRVOM ekranu vlasnika (promena u hodu).
function LanguageHeaderRight() {
  return (
    <View style={{ marginRight: 12 }}>
      <LanguagePicker compact />
    </View>
  );
}

export default function OwnerTabs() {
  const { t } = useTranslation();
  return (
    <Tabs>
      <Tabs.Screen name="trips/index" options={{ title: t("tabs.trips"), headerRight: LanguageHeaderRight }} />
      <Tabs.Screen name="fleet" options={{ title: t("tabs.fleet") }} />
      <Tabs.Screen name="reminders" options={{ title: t("tabs.reminders") }} />
      <Tabs.Screen name="reports" options={{ title: t("tabs.reports") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
