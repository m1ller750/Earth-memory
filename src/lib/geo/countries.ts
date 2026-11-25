import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import ru from "i18n-iso-countries/langs/ru.json";

countries.registerLocale(en);
countries.registerLocale(ru);

export type UiLocale = "en" | "ru";

/** Common short names where the ISO list uses long official forms. */
const EN_OVERRIDES: Record<string, string> = {
  US: "United States",
  RU: "Russia",
  IR: "Iran",
  TZ: "Tanzania",
  CD: "DR Congo",
  CG: "Republic of the Congo",
  PS: "Palestine",
  MK: "North Macedonia",
  CZ: "Czechia",
  TW: "Taiwan",
  SY: "Syria",
  LA: "Laos",
  MD: "Moldova",
  KP: "North Korea",
  KR: "South Korea",
  BN: "Brunei",
  VA: "Vatican City",
  FM: "Micronesia",
  BO: "Bolivia",
  VE: "Venezuela",
  GB: "United Kingdom",
};

const RU_OVERRIDES: Record<string, string> = {
  RU: "Россия",
  KG: "Кыргызстан",
  MD: "Молдова",
  KR: "Южная Корея",
  KP: "Северная Корея",
  CD: "ДР Конго",
  CG: "Республика Конго",
  PS: "Палестина",
  TW: "Тайвань",
};

export function countryName(code: string | null | undefined, locale: UiLocale = "en"): string {
  if (!code) return "";
  const upper = code.toUpperCase();
  const override = (locale === "ru" ? RU_OVERRIDES : EN_OVERRIDES)[upper];
  if (override) return override;
  return countries.getName(upper, locale) ?? upper;
}

export function allCountryCodes(): string[] {
  return Object.keys(countries.getAlpha2Codes());
}

export function numericToAlpha2(numeric: string | number): string | undefined {
  return countries.numericToAlpha2(String(numeric).padStart(3, "0"));
}

export function alpha2ToNumeric(code: string): string | undefined {
  return countries.alpha2ToNumeric(code.toUpperCase());
}

export function isCountryCode(code: string): boolean {
  return countries.isValid(code.toUpperCase());
}

/** Looks a country up by any of its English or Russian names (exact, case-insensitive). */
export function findCountryCode(name: string): string | undefined {
  const query = name.trim().toLowerCase();
  if (query.length === 2 && countries.isValid(query.toUpperCase())) return query.toUpperCase();
  for (const locale of ["en", "ru"] as const) {
    const hit = countries.getAlpha2Code(name.trim(), locale);
    if (hit) return hit;
    for (const [code, value] of Object.entries(locale === "en" ? EN_OVERRIDES : RU_OVERRIDES)) {
      if (value.toLowerCase() === query) return code;
    }
  }
  return undefined;
}
