import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";
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
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.about.eyebrow}</p>
        <h1 className="display mt-4 max-w-4xl font-display text-5xl font-bold leading-[1.02] text-white md:text-7xl">
          {t.about.heading}
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
          {t.about.intro}
        </p>
      </Reveal>

      {/* Vision */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="vision-heading">
        <Reveal>
          <div className="grid gap-8 md:grid-cols-12">
            <h2 id="vision-heading" className="display font-display text-3xl font-bold text-white md:col-span-4 md:text-4xl">{t.about.visionHeading}</h2>
            <div className="md:col-span-8">
              <p className="text-lg leading-relaxed text-zinc-300 md:text-xl">
                {t.about.visionP1}
              </p>
              <p className="mt-5 leading-relaxed text-zinc-400">
                {t.about.visionP2}
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Philosophy */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="philosophy-heading">
        <Reveal>
          <div className="grid gap-8 md:grid-cols-12">
            <h2 id="philosophy-heading" className="display font-display text-3xl font-bold text-white md:col-span-4 md:text-4xl">{t.about.philosophyHeading}</h2>
            <div className="md:col-span-8">
              <blockquote className="display font-display text-2xl font-bold leading-snug text-white md:text-3xl">
                &ldquo;{t.about.philosophyQuote}&rdquo;
              </blockquote>
              <p className="mt-6 leading-relaxed text-zinc-400">
                {t.about.philosophyText}
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* What we believe */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="beliefs-heading">
        <Reveal>
          <h2 id="beliefs-heading" className="display font-display text-3xl font-bold text-white md:text-4xl">{t.about.beliefsHeading}</h2>
        </Reveal>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border hairline bg-white/10 md:grid-cols-2">
          {t.about.beliefs.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.05} className="bg-[#0A0A0F]">
              <div className="h-full p-7 md:p-9">
                <h3 className="display font-display text-xl font-bold text-white md:text-2xl">{b.title}</h3>
                <p className="mt-3 leading-relaxed text-zinc-400">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How we work */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="how-heading">
        <Reveal>
          <h2 id="how-heading" className="display font-display text-3xl font-bold text-white md:text-4xl">{t.about.howHeading}</h2>
          <p className="mt-4 max-w-xl leading-relaxed text-zinc-400">
            {t.about.howIntro}
          </p>
        </Reveal>
        <ol className="mt-10 space-y-0 border-t hairline">
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
