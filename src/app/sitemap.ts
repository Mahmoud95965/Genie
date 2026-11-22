import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { projects } from "@/data/projects";
import { locales, type Locale } from "@/i18n/config";

function entriesFor(locale: Locale): MetadataRoute.Sitemap {
  const base = siteConfig.siteUrl;
  const prefix = `${base}/${locale}`;
  const pages: MetadataRoute.Sitemap = [
    { url: prefix, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    { url: `${prefix}/work`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${prefix}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${prefix}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
  for (const p of projects) {
    pages.push({
      url: `${prefix}/work/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }
  return pages;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.siteUrl;
  const out: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const entry of entriesFor(locale)) {
      const path = entry.url.replace(`${base}/${locale}`, "");
      out.push({
        ...entry,
        alternates: {
          languages: {
            en: `${base}/en${path}`,
            ar: `${base}/ar${path}`,
          },
        },
      });
    }
  }
  return out;
}
