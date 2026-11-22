import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter, Space_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import SiteChrome from "@/components/SiteChrome";
import { siteConfig } from "@/config/site";
import { getMessages, isLocale, locales, type Locale } from "@/i18n/config";
import { openGraph } from "@/lib/og";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  const base = siteConfig.siteUrl;
  return {
    metadataBase: new URL(base),
    title: {
      default: "Genie — Digital Venture Studio | Make Ideas Real.",
      template: "%s — Genie",
    },
    description: t.meta.description,
    keywords: ["Genie", "digital venture studio", "web platforms", "UI/UX design", "AI-powered experiences", "Port Said Hub", "Qena Services"],
    authors: [{ name: "Genie" }],
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", ar: "/ar" },
    },
    openGraph: openGraph(locale, "Genie — Digital Venture Studio | Make Ideas Real.", t.meta.description),
    twitter: {
      card: "summary_large_image",
      title: "Genie — Digital Venture Studio | Make Ideas Real.",
      description: t.meta.description,
      images: ["/logo/genie-logo.jpg"],
    },
    icons: {
      icon: "/logo/genie-logo.jpg",
      shortcut: "/logo/genie-logo.jpg",
      apple: "/logo/genie-logo.jpg",
    },
    robots: { index: true, follow: true },
  };
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale: Locale = params.locale;
  const t = getMessages(locale);
  const dir = locale === "ar" ? "rtl" : "ltr";

  // JSON-LD: name only. The URL is added only once a real domain is
  // configured in src/config/site.ts (the placeholder contains "example").
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Genie",
    description: t.meta.description,
    slogan: siteConfig.tagline,
    inLanguage: locale === "ar" ? "ar" : "en",
  };
  if (!siteConfig.siteUrl.includes("example")) {
    jsonLd.url = siteConfig.siteUrl;
  }

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${grotesk.variable} ${plexArabic.variable}`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`bg-[#050507] text-zinc-100 antialiased ${
          locale === "ar" ? "font-arabic" : "font-sans"
        }`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-black"
        >
          {t.nav.skip}
        </a>
        <SiteChrome locale={locale} t={t}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
