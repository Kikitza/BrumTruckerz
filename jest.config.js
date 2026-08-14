// Jest za Expo (jest-expo preset). Testiramo SAMO čiste funkcije (bez mreže/Supabase).
// Testovi žive pored koda (*.test.ts) u src/.
module.exports = {
  preset: "jest-expo",
  roots: ["<rootDir>/src"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
};
