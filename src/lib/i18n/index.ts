import { en, type Dictionary } from "./en";
import { ru } from "./ru";

export type Locale = "en" | "ru";
export const LOCALES: Locale[] = ["en", "ru"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "em_locale";
export type { Dictionary };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ru";
}

export function getDictionary(locale: Locale): Dictionary {
  return locale === "ru" ? ru : en;
}

/** Replaces {name} placeholders. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

export function formatYear(year: number, locale: Locale): string {
  const t = getDictionary(locale);
  if (year < 0) return `${Math.abs(year).toLocaleString(locale === "ru" ? "ru-RU" : "en-US", { useGrouping: false })} ${t.common.bce}`;
  return String(year);
}

/** "1420–1449", "c. 700 BCE – present", "1974". */
export function formatPeriod(start: number | null | undefined, end: number | null | undefined, locale: Locale): string | null {
  if (start == null && end == null) return null;
  const t = getDictionary(locale);
  const currentYear = new Date().getFullYear();
  const s = start ?? end!;
  const e = end ?? start!;
  const endLabel = e >= currentYear ? t.common.present : formatYear(e, locale);
  if (s === e) return formatYear(s, locale);
  return `${formatYear(s, locale)} – ${endLabel}`;
}

export function formatNumber(n: number, locale: Locale): string {
  return n.toLocaleString(locale === "ru" ? "ru-RU" : "en-US");
}

export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale === "ru" ? "ru-RU" : "en-GB", { year: "numeric", month: "short", day: "numeric" });
}

/** Century label for a year: 15 → "15th c." / "XV в.". */
export function centuryLabel(year: number, locale: Locale): string {
  const century = year >= 0 ? Math.floor(year / 100) + 1 : Math.floor(year / 100);
  if (locale === "ru") {
    const roman = toRoman(Math.abs(century));
    return century < 0 ? `${roman} в. до н. э.` : `${roman} в.`;
  }
  const n = Math.abs(century);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return century < 0 ? `${n}${suffix} c. BCE` : `${n}${suffix} c.`;
}

function toRoman(n: number): string {
  const map: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [value, numeral] of map) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out || "0";
}
