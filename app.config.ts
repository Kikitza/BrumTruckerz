import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "ETNOP",                       // vidljivo ime aplikacije (brend; v. src/lib/brand.ts)
  slug: "kikitza",                     // EAS projekat-slug (mora da odgovara projectId-u; interni identifikator, ne brend)
  owner: "kikitzas-team",              // EAS nalog vlasnik projekta (projectId živi pod ovim nalogom)
  scheme: "brumtruckerz",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",   // prati sistem (dark/light) — pravilo #8
  icon: "./assets/icon.png",         // 1024×1024, ETNOP Evropa dot-map, puna #0B1220 podloga (bez alfe)
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-localization",
    "expo-notifications",
    "expo-sqlite",
    "@react-native-community/datetimepicker",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",   // ETNOP znak (providan), pozadina ide odvojeno
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#0B1220",
        dark: { image: "./assets/splash-icon.png", backgroundColor: "#0B1220" },
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
  // Web (F3): isti kod u browseru (react-native-web). Ciljna publika weba v1 = KANCELARIJA
  // (owner/dispatcher/admin); vozač ostaje mobilni. Web je UVEK ONLINE (offline red = native-only).
  web: { bundler: "metro", output: "single", favicon: "./assets/icon.png" },
  ios: { supportsTablet: false, bundleIdentifier: "com.brumtruckerz.app" },
  android: {
    package: "com.brumtruckerz.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png", // providan ETNOP znak, u sigurnoj zoni
      backgroundColor: "#0B1220",
    },
  },
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: "991f25e9-c8c1-4ba0-b4cf-d7cb4e6d28a0" } },
};
export default config;
