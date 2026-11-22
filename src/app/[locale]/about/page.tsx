import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import Capabilities from "@/components/Capabilities";
import SectionHeading from "@/components/SectionHeading";
import { getMessages, isLocale, localizedPath, type Locale } from "@/i18n/config";
import { openGraph } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  return {
    title: t.nav.about,
    description: t.meta.aboutDescription,
    alternates: {
      canonical: `/${locale}/about`,
      languages: { en: "/en/about", ar: "/ar/about" },
    },
    openGraph: openGraph(locale, `${t.nav.about} — Genie`, t.meta.aboutDescription),
  };
}

export default function AboutPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  const contactHref = localizedPath(locale, "/contact");

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-32">
      <Reveal>
        <SectionHeading number="—" eyebrow={t.about.eyebrow} />
        <h1 className="display mt-6 max-w-4xl font-display text-5xl font-bold leading-[1.02] text-white md:text-7xl">
          {t.about.heading}
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
          {t.about.intro}
        </p>
      </Reveal>

      {/* 01 · Vision */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="vision-heading">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="md:sticky md:top-28">
              <SectionHeading number="01" eyebrow={t.about.visionHeading} />
            </div>
          </div>
          <div className="md:col-span-8">
            <Reveal>
              <h2 id="vision-heading" className="sr-only">{t.about.visionHeading}</h2>
              <p className="display font-display text-2xl font-bold leading-snug text-white md:text-4xl">
                {t.about.visionText}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 02 · Mission */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="mission-heading">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="md:sticky md:top-28">
              <SectionHeading number="02" eyebrow={t.about.missionHeading} />
            </div>
          </div>
          <div className="md:col-span-8">
            <Reveal>
              <h2 id="mission-heading" className="sr-only">{t.about.missionHeading}</h2>
              <p className="display font-display text-2xl font-bold leading-snug text-white md:text-4xl">
                {t.about.missionText}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 03 · Philosophy */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="philosophy-heading">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="md:sticky md:top-28">
              <SectionHeading number="03" eyebrow={t.about.philosophyHeading} />
            </div>
          </div>
          <div className="md:col-span-8">
            <Reveal>
              <h2 id="philosophy-heading" className="sr-only">{t.about.philosophyHeading}</h2>
              <blockquote className="display font-display text-2xl font-bold leading-snug text-white md:text-3xl">
                &ldquo;{t.about.philosophyQuote}&rdquo;
              </blockquote>
              <p className="mt-6 max-w-2xl leading-relaxed text-zinc-400">
                {t.about.philosophyText}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 04 · What we do */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="pillars-heading">
        <SectionHeading
          number="04"
          eyebrow={t.home.whatEyebrow}
          title={t.home.whatHeading}
          intro={t.home.whatIntro}
          id="pillars-heading"
        />
        <Capabilities items={t.capabilities} />
      </section>

      {/* 05 · How we work */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="how-heading">
        <SectionHeading
          number="05"
          eyebrow={t.home.approachEyebrow}
          title={t.about.howHeading}
          intro={t.about.howIntro}
          id="how-heading"
        />
        <ol className="mt-12 border-t hairline md:mt-16">
          {t.about.howItems.map((w, i) => (
            <Reveal key={w.title}>
              <li className="grid gap-3 border-b hairline py-7 md:grid-cols-12 md:gap-8 md:py-9">
                <span className="font-display text-2xl font-bold text-sky/80 md:col-span-2">0{i + 1}</span>
                <h3 className="display font-display text-2xl font-bold text-white md:col-span-4">{w.title}</h3>
                <p className="leading-relaxed text-zinc-400 md:col-span-6">{w.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Ambitions */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="ambitions-heading">
        <Reveal>
          <div className="grid gap-8 md:grid-cols-12">
            <h2 id="ambitions-heading" className="display font-display text-3xl font-bold text-white md:col-span-4 md:text-4xl">{t.about.ambitionsHeading}</h2>
            <div className="md:col-span-8">
              <p className="text-lg leading-relaxed text-zinc-300">
                {t.about.ambitionsP1}
              </p>
              <p className="mt-5 leading-relaxed text-zinc-400">
                {t.about.ambitionsP2}
              </p>
              <Link
                href={contactHref}
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky"
              >
                {t.home.closingButton}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
