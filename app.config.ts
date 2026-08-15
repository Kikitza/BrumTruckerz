import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "BrumTruckerz",                // vidljivo ime aplikacije
  slug: "kikitza",                     // EAS projekat-slug (mora da odgovara projectId-u; interni identifikator, ne brend)
  owner: "kikitzas-team",              // EAS nalog vlasnik projekta (projectId živi pod ovim nalogom)
  scheme: "brumtruckerz",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",   // prati sistem (dark/light) — pravilo #8
  icon: "./assets/icon.png",         // 1024×1024, puna #0B1F3A podloga (bez alfe)
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-localization",
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",   // znak (providan), pozadina ide odvojeno
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0B1F3A",
        dark: { image: "./assets/splash-icon.png", backgroundColor: "#0B1F3A" },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Aplikaciji je potrebna dozvola za pristup galeriji radi prilaganja dokumenata.",
        cameraPermission: "Aplikaciji je potrebna dozvola za kameru radi slikanja dokumenata.",
      },
    ],
  ],
  ios: { supportsTablet: false, bundleIdentifier: "com.brumtruckerz.app" },
  android: {
    package: "com.brumtruckerz.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png", // providan znak, u sigurnoj zoni
      backgroundColor: "#0B1F3A",
    },
  },
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: "991f25e9-c8c1-4ba0-b4cf-d7cb4e6d28a0" } },
};
export default config;
