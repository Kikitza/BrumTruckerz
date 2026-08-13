import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "BrumTruckerz",
  slug: "brumtruckerz",
  scheme: "brumtruckerz",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",   // prati sistem (dark/light) — pravilo #8
  plugins: ["expo-router", "expo-asset", "expo-localization", "expo-sqlite"],
  ios: { supportsTablet: false, bundleIdentifier: "com.brumtruckerz.app" },
  android: { package: "com.brumtruckerz.app" },
  experiments: { typedRoutes: true },
};
export default config;
