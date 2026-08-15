import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../src/lib/theme";

// Platform admin: jednostavan Stack (header poštuje gornji safe-area inset).
export default function AdminLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t("admin.title") }} />
    </Stack>
  );
}
