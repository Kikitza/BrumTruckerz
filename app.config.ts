import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "BrumTruckerz",
  slug: "brumtruckerz",
  scheme: "brumtruckerz",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",   // prati sistem (dark/light) — pravilo #8
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-localization",
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    [
      "expo-image-picker",
      {
        photosPermission: "Aplikaciji je potrebna dozvola za pristup galeriji radi prilaganja dokumenata.",
        cameraPermission: "Aplikaciji je potrebna dozvola za kameru radi slikanja dokumenata.",
      },
    ],
  ],
  ios: { supportsTablet: false, bundleIdentifier: "com.brumtruckerz.app" },
  android: { package: "com.brumtruckerz.app" },
  experiments: { typedRoutes: true },
};
export default config;
