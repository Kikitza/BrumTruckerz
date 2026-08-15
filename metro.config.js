// Metro: omogućava import .svg fajlova kao React komponenti (react-native-svg-transformer).
// Bez ovoga bi .svg bio tretiran kao statički asset, ne kao komponenta.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.transformer.babelTransformerPath = require.resolve("react-native-svg-transformer/expo");
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;
