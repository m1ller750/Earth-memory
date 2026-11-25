import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/**
 * English unless the visitor picked another language with the switcher (stored in a cookie).
 * The browser's Accept-Language is deliberately ignored: English is the default for everyone.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
