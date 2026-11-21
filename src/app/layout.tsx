import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { siteConfig } from "@/config/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: "Genie — Digital Product Studio | Make Ideas Real.",
    template: "%s — Genie",
  },
  description: siteConfig.description,
  keywords: ["Genie", "digital product studio", "web platforms", "UI/UX design", "AI-powered experiences", "Port Said Hub", "Qena Services"],
  authors: [{ name: "Genie" }],
  openGraph: {
    type: "website",
    siteName: "Genie",
    title: "Genie — Digital Product Studio | Make Ideas Real.",
    description: siteConfig.description,
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "Genie — Make Ideas Real." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Genie — Digital Product Studio | Make Ideas Real.",
    description: siteConfig.description,
    images: ["/og-image.svg"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // JSON-LD: name only. The URL is added only once a real domain is
  // configured in src/config/site.ts (the placeholder contains "example").
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Genie",
    description: siteConfig.description,
    slogan: siteConfig.tagline,
  };
  if (!siteConfig.siteUrl.includes("example")) {
    jsonLd.url = siteConfig.siteUrl;
  }

  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="bg-[#050507] font-sans text-zinc-100 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:text-black"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
