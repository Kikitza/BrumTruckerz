// ESLint 9 (flat config) = standardni Expo lint. Ne reformatiramo projekat — samo
// prijavljujemo stvarne greške; upozorenja ostaju upozorenja.
const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: [
      "node_modules/",
      ".expo/",
      "dist/",
      "supabase/functions/", // Deno runtime — nije deo Expo klijenta
      "babel.config.js",
      "jest.config.js",
      "jest.setup.js",
    ],
  },
  {
    // Test fajlovi: Jest globali (describe/it/expect/jest).
    files: ["**/*.test.ts", "**/*.test.tsx"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        jest: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
];
