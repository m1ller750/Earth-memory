/**
 * Geographic vocabulary based on the UN M49 geoscheme (ISO 3166-1 alpha-2 codes).
 * Used to group countries on the globe and dashboard, and to resolve region names
 * in search queries ("Central Asia", "Средняя Азия") into country filters.
 */

export type Continent = "Africa" | "Americas" | "Asia" | "Europe" | "Oceania" | "Antarctica";

const SUBREGIONS: Record<string, { continent: Continent; codes: string }> = {
  "Northern Africa": { continent: "Africa", codes: "DZ EG LY MA SD TN EH" },
  "Eastern Africa": { continent: "Africa", codes: "BI KM DJ ER ET KE MG MW MU YT MZ RE RW SC SO SS TZ UG ZM ZW IO TF" },
  "Middle Africa": { continent: "Africa", codes: "AO CM CF TD CG CD GQ GA ST" },
  "Southern Africa": { continent: "Africa", codes: "BW SZ LS NA ZA" },
  "Western Africa": { continent: "Africa", codes: "BJ BF CV CI GM GH GN GW LR ML MR NE NG SH SN SL TG" },
  Caribbean: { continent: "Americas", codes: "AI AG AW BS BB BQ VG KY CU CW DM DO GD GP HT JM MQ MS PR BL KN LC MF VC SX TT TC VI" },
  "Central America": { continent: "Americas", codes: "BZ CR SV GT HN MX NI PA" },
  "South America": { continent: "Americas", codes: "AR BO BR CL CO EC FK GF GY PY PE SR UY VE GS BV" },
  "Northern America": { continent: "Americas", codes: "BM CA GL PM US" },
  "Central Asia": { continent: "Asia", codes: "KZ KG TJ TM UZ" },
  "Eastern Asia": { continent: "Asia", codes: "CN HK MO KP JP MN KR TW" },
  "South-eastern Asia": { continent: "Asia", codes: "BN KH ID LA MY MM PH SG TH TL VN" },
  "Southern Asia": { continent: "Asia", codes: "AF BD BT IN IR MV NP PK LK" },
  "Western Asia": { continent: "Asia", codes: "AM AZ BH CY GE IQ IL JO KW LB OM QA SA PS SY TR AE YE" },
  "Eastern Europe": { continent: "Europe", codes: "BY BG CZ HU PL MD RO RU SK UA" },
  "Northern Europe": { continent: "Europe", codes: "AX DK EE FO FI GG IS IE IM JE LV LT NO SJ SE GB" },
  "Southern Europe": { continent: "Europe", codes: "AL AD BA HR GI GR VA IT MT ME MK PT SM RS SI ES XK" },
  "Western Europe": { continent: "Europe", codes: "AT BE FR DE LI LU MC NL CH" },
  "Australia and New Zealand": { continent: "Oceania", codes: "AU NZ NF CX CC HM" },
  Melanesia: { continent: "Oceania", codes: "FJ NC PG SB VU" },
  Micronesia: { continent: "Oceania", codes: "GU KI MH FM NR MP PW" },
  Polynesia: { continent: "Oceania", codes: "AS CK PF NU PN WS TK TO TV WF" },
  Antarctica: { continent: "Antarctica", codes: "AQ" },
};

const BY_CODE = new Map<string, { subregion: string; continent: Continent }>();
for (const [subregion, { continent, codes }] of Object.entries(SUBREGIONS)) {
  for (const code of codes.split(" ")) BY_CODE.set(code, { subregion, continent });
}

export function subregionOf(code: string): string | null {
  return BY_CODE.get(code.toUpperCase())?.subregion ?? null;
}

export function continentOf(code: string): Continent | null {
  return BY_CODE.get(code.toUpperCase())?.continent ?? null;
}

export function codesInSubregion(subregion: string): string[] {
  return SUBREGIONS[subregion]?.codes.split(" ") ?? [];
}

export function codesInContinent(continent: Continent): string[] {
  return Object.values(SUBREGIONS)
    .filter((s) => s.continent === continent)
    .flatMap((s) => s.codes.split(" "));
}

export const SUBREGION_NAMES = Object.keys(SUBREGIONS);

/**
 * Region phrases people actually type, in English and Russian, mapped to country codes.
 * Longer phrases are matched first so "central asia" wins over "asia".
 */
const REGION_PHRASES: Array<{ label: string; phrases: string[]; codes: () => string[] }> = [
  { label: "Central Asia", phrases: ["central asia", "middle asia", "центральная азия", "средняя азия", "центральной азии", "средней азии", "markaziy osiyo", "orta aziya"], codes: () => codesInSubregion("Central Asia") },
  { label: "Silk Road countries", phrases: ["silk road", "silk roads", "шелковый путь", "шёлковый путь", "шелкового пути", "шёлкового пути"], codes: () => ["CN", "KZ", "KG", "TJ", "TM", "UZ", "AF", "IR", "IQ", "SY", "TR", "IN", "PK", "MN"] },
  { label: "Caucasus", phrases: ["caucasus", "кавказ", "кавказа"], codes: () => ["AM", "AZ", "GE"] },
  { label: "Middle East", phrases: ["middle east", "near east", "ближний восток", "ближнего востока"], codes: () => ["BH", "CY", "EG", "IR", "IQ", "IL", "JO", "KW", "LB", "OM", "QA", "SA", "PS", "SY", "TR", "AE", "YE"] },
  { label: "Siberia", phrases: ["siberia", "сибирь", "сибири"], codes: () => ["RU"] },
  { label: "Arctic", phrases: ["arctic", "арктика", "арктики"], codes: () => ["GL", "IS", "NO", "SE", "FI", "RU", "CA", "US"] },
  { label: "Sahel", phrases: ["sahel", "сахель"], codes: () => ["SN", "MR", "ML", "BF", "NE", "TD", "SD", "NG"] },
  { label: "Horn of Africa", phrases: ["horn of africa", "африканский рог"], codes: () => ["DJ", "ER", "ET", "SO"] },
  { label: "Scandinavia", phrases: ["scandinavia", "скандинавия", "скандинавии"], codes: () => ["DK", "NO", "SE"] },
  { label: "Balkans", phrases: ["balkans", "балканы", "балкан"], codes: () => ["AL", "BA", "BG", "HR", "XK", "ME", "MK", "RS", "SI", "GR"] },
  { label: "Pacific Islands", phrases: ["pacific islands", "polynesia", "melanesia", "micronesia", "острова тихого океана", "полинезия"], codes: () => [...codesInSubregion("Melanesia"), ...codesInSubregion("Micronesia"), ...codesInSubregion("Polynesia")] },
  { label: "Latin America", phrases: ["latin america", "латинская америка", "латинской америки"], codes: () => [...codesInSubregion("Central America"), ...codesInSubregion("South America"), ...codesInSubregion("Caribbean")] },
  { label: "Southeast Asia", phrases: ["southeast asia", "south-east asia", "south east asia", "юго-восточная азия", "юго-восточной азии"], codes: () => codesInSubregion("South-eastern Asia") },
  { label: "East Asia", phrases: ["east asia", "eastern asia", "восточная азия", "восточной азии"], codes: () => codesInSubregion("Eastern Asia") },
  { label: "South Asia", phrases: ["south asia", "southern asia", "южная азия", "южной азии"], codes: () => codesInSubregion("Southern Asia") },
  { label: "Western Asia", phrases: ["western asia", "west asia", "западная азия"], codes: () => codesInSubregion("Western Asia") },
  { label: "Eastern Europe", phrases: ["eastern europe", "восточная европа", "восточной европы"], codes: () => codesInSubregion("Eastern Europe") },
  { label: "Northern Europe", phrases: ["northern europe", "северная европа", "северной европы"], codes: () => codesInSubregion("Northern Europe") },
  { label: "Southern Europe", phrases: ["southern europe", "южная европа", "южной европы"], codes: () => codesInSubregion("Southern Europe") },
  { label: "Western Europe", phrases: ["western europe", "западная европа", "западной европы"], codes: () => codesInSubregion("Western Europe") },
  { label: "North Africa", phrases: ["north africa", "northern africa", "северная африка", "северной африки"], codes: () => codesInSubregion("Northern Africa") },
  { label: "West Africa", phrases: ["west africa", "western africa", "западная африка", "западной африки"], codes: () => codesInSubregion("Western Africa") },
  { label: "East Africa", phrases: ["east africa", "eastern africa", "восточная африка", "восточной африки"], codes: () => codesInSubregion("Eastern Africa") },
  { label: "Central Africa", phrases: ["central africa", "middle africa", "центральная африка", "центральной африки"], codes: () => codesInSubregion("Middle Africa") },
  { label: "Southern Africa", phrases: ["southern africa", "южная африка", "южной африки"], codes: () => codesInSubregion("Southern Africa") },
  { label: "South America", phrases: ["south america", "южная америка", "южной америки"], codes: () => codesInSubregion("South America") },
  { label: "Central America", phrases: ["central america", "центральная америка", "центральной америки"], codes: () => codesInSubregion("Central America") },
  { label: "North America", phrases: ["north america", "northern america", "северная америка", "северной америки"], codes: () => codesInSubregion("Northern America") },
  { label: "Caribbean", phrases: ["caribbean", "карибы", "карибского"], codes: () => codesInSubregion("Caribbean") },
  { label: "Africa", phrases: ["africa", "африка", "африки", "африке"], codes: () => codesInContinent("Africa") },
  { label: "Asia", phrases: ["asia", "азия", "азии"], codes: () => codesInContinent("Asia") },
  { label: "Europe", phrases: ["europe", "европа", "европы", "европе"], codes: () => codesInContinent("Europe") },
  { label: "Americas", phrases: ["americas", "america", "америка", "америки"], codes: () => codesInContinent("Americas") },
  { label: "Oceania", phrases: ["oceania", "океания", "океании"], codes: () => codesInContinent("Oceania") },
];

const SORTED_PHRASES = REGION_PHRASES.flatMap((r) => r.phrases.map((p) => ({ phrase: p, region: r }))).sort(
  (a, b) => b.phrase.length - a.phrase.length,
);

export interface RegionMatch {
  label: string;
  phrase: string;
  codes: string[];
}

/** Finds the most specific region phrase in free text. Returns null when none is present. */
export function findRegion(text: string): RegionMatch | null {
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ")} `;
  for (const { phrase, region } of SORTED_PHRASES) {
    if (haystack.includes(` ${phrase} `)) {
      return { label: region.label, phrase, codes: region.codes() };
    }
  }
  return null;
}
