import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../../src/i18n/LanguagePicker";
import { useTabsScreenOptions } from "../../src/components/navOptions";

// Zastava trenutnog jezika gore desno na PRVOM ekranu vozača (promena u hodu).
// U nativnom headeru (koji poštuje gornji safe-area inset) — ne ulazi pod statusnu traku.
function LanguageHeaderRight() {
  return (
    <View style={{ marginRight: 12 }}>
      <LanguagePicker compact />
    </View>
  );
}

export default function DriverTabs() {
  const { t } = useTranslation();
  const screenOptions = useTabsScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: t("tabs.myTrip"), headerRight: LanguageHeaderRight }} />
      <Tabs.Screen name="documents" options={{ title: t("tabs.documents") }} />
      <Tabs.Screen name="resources" options={{ title: t("tabs.resources") }} />
    </Tabs>
  );
}
