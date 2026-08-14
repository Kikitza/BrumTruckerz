// Babel konfiguracija = podrazumevani Expo preset (isti transform koji Metro ionako
// primenjuje). Postoji da bi ga jest-expo koristio pri pokretanju testova; ne menja
// ponašanje aplikacije.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
