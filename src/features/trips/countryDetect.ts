// Heuristička detekcija ZEMLJE iz slobodnog teksta mesta (BEZ plaćenih servisa) — čista fn (testabilno).
// Vraća predlog koda (ISO 2, iz šifarnika countries) + „sigurnost". NE nagađa na silu: kad nije jasno
// → { code: null, confident: false } (ostaje za ručnu potvrdu). country_source='auto' se upisuje SAMO za confident.
//
// Redosled: (1) eksplicitan kod na kraju („…, DE" / „(DE)"); (2) ime zemlje u tekstu; (3) poznat veliki grad.

// Kodovi iz šifarnika (0025) — jedini dozvoljeni izlazi.
const VALID = new Set([
  "RS","AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT",
  "NL","PL","PT","RO","SK","SI","ES","SE","CH","IS","LI","NO","GB","BA","ME","MK","AL","XK","TR","UA","MD",
]);

// Normalizacija: mala slova, bez dijakritike, kolabirani razmaci.
export function normalizePlace(s: string): string {
  return (s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

// Imena zemalja (varijante: lokalno/en/de/sr) → kod. Ključevi su normalizovani (bez dijakritike).
const NAME: Record<string, string> = {
  srbija:"RS", serbia:"RS", serbien:"RS",
  nemacka:"DE", njemacka:"DE", germany:"DE", deutschland:"DE",
  austrija:"AT", austria:"AT", osterreich:"AT",
  italija:"IT", italy:"IT", italia:"IT", italien:"IT",
  francuska:"FR", france:"FR", frankreich:"FR",
  slovenija:"SI", slovenia:"SI", slowenien:"SI",
  hrvatska:"HR", croatia:"HR", kroatien:"HR",
  madjarska:"HU", hungary:"HU", ungarn:"HU",
  bugarska:"BG", bulgaria:"BG", bulgarien:"BG",
  rumunija:"RO", romania:"RO", rumanien:"RO",
  poljska:"PL", poland:"PL", polen:"PL",
  ceska:"CZ", "ceska republika":"CZ", "czech republic":"CZ", czechia:"CZ", tschechien:"CZ",
  slovacka:"SK", slovakia:"SK", slowakei:"SK",
  holandija:"NL", nizozemska:"NL", netherlands:"NL", niederlande:"NL",
  belgija:"BE", belgium:"BE", belgien:"BE",
  spanija:"ES", spain:"ES", espana:"ES", spanien:"ES",
  svajcarska:"CH", switzerland:"CH", schweiz:"CH",
  "bosna i hercegovina":"BA", bosna:"BA", bosnia:"BA",
  "crna gora":"ME", montenegro:"ME",
  makedonija:"MK", "north macedonia":"MK", "severna makedonija":"MK",
  albanija:"AL", albania:"AL",
  kosovo:"XK",
  turska:"TR", turkey:"TR", turkiye:"TR",
  grcka:"GR", greece:"GR",
  danska:"DK", denmark:"DK",
  svedska:"SE", sweden:"SE",
  norveska:"NO", norway:"NO",
  finska:"FI", finland:"FI",
  portugal:"PT", portugalija:"PT",
  irska:"IE", ireland:"IE",
  "velika britanija":"GB", britanija:"GB", "united kingdom":"GB", "great britain":"GB", england:"GB",
  ukrajina:"UA", ukraine:"UA", moldavija:"MD", moldova:"MD",
  luksemburg:"LU", luxembourg:"LU",
};

// Poznati veliki gradovi → kod (dovoljno za tipične transportne relacije).
const CITY: Record<string, string> = {
  beograd:"RS", "novi sad":"RS", nis:"RS", belgrade:"RS", kragujevac:"RS", subotica:"RS",
  minhen:"DE", munchen:"DE", munich:"DE", berlin:"DE", hamburg:"DE", koln:"DE", cologne:"DE",
  frankfurt:"DE", stuttgart:"DE", dortmund:"DE", nurnberg:"DE", nuremberg:"DE", leipzig:"DE", dresden:"DE",
  dusseldorf:"DE", bremen:"DE", hannover:"DE", duisburg:"DE",
  bec:"AT", wien:"AT", vienna:"AT", graz:"AT", linz:"AT", salzburg:"AT", innsbruck:"AT",
  milano:"IT", milan:"IT", rim:"IT", roma:"IT", rome:"IT", torino:"IT", turin:"IT", napoli:"IT", verona:"IT",
  bologna:"IT", venecija:"IT", venezia:"IT", venice:"IT", firenca:"IT", genova:"IT", trst:"IT", trieste:"IT",
  pariz:"FR", paris:"FR", lion:"FR", lyon:"FR", marsej:"FR", marseille:"FR", lil:"FR", lille:"FR", strazbur:"FR", strasbourg:"FR",
  ljubljana:"SI", maribor:"SI", koper:"SI", celje:"SI",
  zagreb:"HR", split:"HR", rijeka:"HR", osijek:"HR", zadar:"HR",
  budimpesta:"HU", budapest:"HU", debrecen:"HU", szeged:"HU", gyor:"HU",
  sofija:"BG", sofia:"BG", plovdiv:"BG", varna:"BG", burgas:"BG",
  bukurest:"RO", bucuresti:"RO", bucharest:"RO", timisoara:"RO", cluj:"RO", arad:"RO", sibiu:"RO",
  varsava:"PL", warszawa:"PL", warsaw:"PL", krakov:"PL", krakow:"PL", vroclav:"PL", wroclaw:"PL", poznan:"PL", lodz:"PL", katowice:"PL",
  prag:"CZ", praha:"CZ", prague:"CZ", brno:"CZ", ostrava:"CZ", plzen:"CZ",
  bratislava:"SK", kosice:"SK", zilina:"SK", nitra:"SK",
  amsterdam:"NL", roterdam:"NL", rotterdam:"NL", hag:"NL", "den haag":"NL", utreht:"NL", utrecht:"NL", ajndhoven:"NL", eindhoven:"NL",
  brisel:"BE", brussel:"BE", brussels:"BE", bruxelles:"BE", antverpen:"BE", antwerpen:"BE", antwerp:"BE", gent:"BE", liege:"BE",
  madrid:"ES", barselona:"ES", barcelona:"ES", valensija:"ES", valencia:"ES", sevilja:"ES", sevilla:"ES", bilbao:"ES",
  cirih:"CH", zurich:"CH", zurih:"CH", zeneva:"CH", geneva:"CH", bazel:"CH", basel:"CH", bern:"CH",
  sarajevo:"BA", "banja luka":"BA", mostar:"BA", tuzla:"BA", zenica:"BA", bijeljina:"BA",
  podgorica:"ME", niksic:"ME", bar:"ME",
  skoplje:"MK", skopje:"MK", bitola:"MK", kumanovo:"MK",
  tirana:"AL", drac:"AL", durres:"AL",
  pristina:"XK", prizren:"XK",
  istanbul:"TR", ankara:"TR", izmir:"TR", bursa:"TR",
  atina:"GR", athens:"GR", solun:"GR", thessaloniki:"GR",
  kopenhagen:"DK", copenhagen:"DK", kobenhavn:"DK",
  stokholm:"SE", stockholm:"SE", geteborg:"SE", goteborg:"SE", malme:"SE", malmo:"SE",
  oslo:"NO", bergen:"NO",
  helsinki:"FI", tampere:"FI",
  lisabon:"PT", lisboa:"PT", lisbon:"PT", porto:"PT",
  dablin:"IE", dublin:"IE",
  london:"GB", mancester:"GB", manchester:"GB", birmingem:"GB", birmingham:"GB", liverpul:"GB", liverpool:"GB",
  luxembourg:"LU",
  kijev:"UA", kyiv:"UA", kiev:"UA", lavov:"UA", lviv:"UA",
};

export type CountryGuess = { code: string | null; confident: boolean };

const miss: CountryGuess = { code: null, confident: false };

export function detectCountry(place: string | null | undefined): CountryGuess {
  const raw = (place ?? "").trim();
  if (!raw) return miss;
  const s = normalizePlace(raw);

  // (1) Eksplicitan kod na kraju: „…, DE" / „… (DE)" / „…-DE".
  const m = s.match(/[,(\-\/]\s*([a-z]{2})\)?\s*$/);
  if (m) {
    const code = m[1].toUpperCase();
    if (VALID.has(code)) return { code, confident: true };
  }

  // (2) Ime zemlje (višerečna imena preko `includes`, jednorečna preko tokena).
  for (const key in NAME) {
    if (key.includes(" ")) { if (s.includes(key)) return { code: NAME[key], confident: true }; }
  }
  const tokens = s.split(/[^a-z]+/).filter(Boolean);
  for (const tk of tokens) if (NAME[tk]) return { code: NAME[tk], confident: true };

  // (3) Poznat grad (višerečni preko includes, jednorečni preko tokena).
  for (const key in CITY) {
    if (key.includes(" ")) { if (s.includes(key)) return { code: CITY[key], confident: true }; }
  }
  for (const tk of tokens) if (CITY[tk]) return { code: CITY[tk], confident: true };

  return miss;
}
