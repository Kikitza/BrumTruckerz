import { Tabs } from "expo-router";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../../src/i18n/LanguagePicker";

// Zastava trenutnog jezika gore desno na PRVOM ekranu vozača (promena u hodu).
function LanguageHeaderRight() {
  return (
    <View style={{ marginRight: 12 }}>
      <LanguagePicker compact />
    </View>
  );
}

export default function DriverTabs() {
  const { t } = useTranslation();
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: t("tabs.myTrip"), headerRight: LanguageHeaderRight }} />
      <Tabs.Screen name="documents" options={{ title: t("tabs.documents") }} />
      <Tabs.Screen name="resources" options={{ title: t("tabs.resources") }} />
    </Tabs>
  );
}
