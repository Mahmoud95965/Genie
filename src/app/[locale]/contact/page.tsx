import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import Reveal from "@/components/Reveal";
import { siteConfig } from "@/config/site";
import { getMessages, isLocale, type Locale } from "@/i18n/config";
import { openGraph } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  return {
    title: t.nav.contact,
    description: t.meta.contactDescription,
    alternates: {
      canonical: `/${locale}/contact`,
      languages: { en: "/en/contact", ar: "/ar/contact" },
    },
    openGraph: openGraph(locale, `${t.nav.contact} — Genie`, t.meta.contactDescription),
  };
}

export default function ContactPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <div className="grid gap-14 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-5">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.contact.eyebrow}</p>
            <h1 className="display mt-4 font-display text-5xl font-bold leading-[1.02] text-white md:text-6xl">
              {t.contact.heading}
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
              {t.contact.intro}
            </p>
            {siteConfig.contactEmail ? (
              <p className="mt-8 text-sm text-zinc-400">
                {t.contact.directEmail}{" "}
                <a href={`mailto:${siteConfig.contactEmail}`} className="font-medium text-white underline decoration-sky underline-offset-4">
                  {siteConfig.contactEmail}
                </a>
              </p>
            ) : (
              <p className="mt-8 rounded-xl border hairline bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-zinc-500">
                {t.contact.setupNote}
              </p>
            )}
          </Reveal>
        </div>
        <div className="md:col-span-7">
          <Reveal delay={0.1}>
            <ContactForm t={t.contact.form} />
          </Reveal>
        </div>
      </div>
    </div>
  );
}
