import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

export default function DriverTabs() {
  const { t } = useTranslation();
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: t("tabs.myTrip") }} />
      <Tabs.Screen name="documents" options={{ title: t("tabs.documents") }} />
      <Tabs.Screen name="resources" options={{ title: t("tabs.resources") }} />
    </Tabs>
  );
}
