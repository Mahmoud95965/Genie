import { enMessages, type Messages } from "./messages/en";
import { arMessages } from "./messages/ar";

export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getMessages(locale: Locale): Messages {
  return locale === "ar" ? arMessages : enMessages;
}

/** Localized path: `/en/work`, `/ar/contact`, `/` → `/en` / `/ar`. */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path === "/" ? "" : path;
  return `/${locale}${clean}`;
}

/** Strip a leading /en or /ar segment from a pathname. */
export function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";
}
