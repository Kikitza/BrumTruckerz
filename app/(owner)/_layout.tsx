import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

export default function OwnerTabs() {
  const { t } = useTranslation();
  return (
    <Tabs>
      <Tabs.Screen name="trips/index" options={{ title: t("tabs.trips") }} />
      <Tabs.Screen name="fleet" options={{ title: t("tabs.fleet") }} />
      <Tabs.Screen name="reminders" options={{ title: t("tabs.reminders") }} />
      <Tabs.Screen name="reports" options={{ title: t("tabs.reports") }} />
      <Tabs.Screen name="settings" options={{ title: t("tabs.settings") }} />
    </Tabs>
  );
}
