// Boot ekran (dok se app diže / rola i status firme razrešavaju) — zamena za goli spinner.
// Uvek TAMNI brend badge (#0B1220) sa punim znakom (etnop-logo-europe = mapa + ETNOP + tagline),
// suptilan spinner i „Učitavanje…". Fiksna brend paleta (v. src/lib/brand.ts), ne tema-token.
import { View, Text, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { BRAND_BG, BRAND_CYAN, BRAND_MINT } from "../lib/brand";
import EtnopLogo from "../../assets/brand/etnop-logo-europe.svg";

export function BootScreen() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: BRAND_BG, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <EtnopLogo width={220} height={293} />
      <ActivityIndicator color={BRAND_CYAN} />
      <Text style={{ color: BRAND_MINT, fontSize: 12, letterSpacing: 0.5 }}>{t("common.loading")}</Text>
    </View>
  );
}
