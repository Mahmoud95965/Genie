import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";

/**
 * Shared Open Graph object (per locale). Every page uses this so the logo
 * image, type, site name and locale are never lost when a page overrides
 * the layout's openGraph — Next replaces (does not deep-merge) openGraph
 * between layout and page metadata.
 */
export function openGraph(
  locale: Locale,
  title: string,
  description: string,
): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: "Genie",
    title,
    description,
    locale: locale === "ar" ? "ar_EG" : "en_US",
    alternateLocale: locale === "ar" ? ["en_US"] : ["ar_EG"],
    images: [
      {
        url: "/logo/genie-logo.jpg",
        width: 1254,
        height: 1254,
        alt: "Genie — Make Ideas Real.",
      },
    ],
  };
}
