"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getMessages, isLocale, localizedPath, type Locale } from "@/i18n/config";

/**
 * Localized 404. Note: `not-found.tsx` does NOT receive route `params`
 * as a prop, so the locale comes from useParams() with an English fallback.
 */
export default function LocaleNotFound() {
  const raw = useParams();
  const locale: Locale =
    raw && typeof raw.locale === "string" && isLocale(raw.locale) ? raw.locale : "en";
  const t = getMessages(locale);
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-40 text-center md:px-10 md:pt-56 md:pb-36">
      <p className="text-xs uppercase tracking-[0.28em] text-sky">404</p>
      <h1 className="display mx-auto mt-4 max-w-2xl font-display text-5xl font-bold text-white md:text-7xl">
        {t.notFound.heading}
      </h1>
      <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
        {t.notFound.text}
      </p>
      <Link
        href={localizedPath(locale, "/")}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-medium text-black transition-colors hover:bg-sky"
      >
        {t.notFound.back}
      </Link>
    </div>
  );
}
