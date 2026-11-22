import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import HeroVisual from "@/components/HeroVisual";
import ProjectCover from "@/components/ProjectCover";
import Reveal from "@/components/Reveal";
import Capabilities from "@/components/Capabilities";
import { projects } from "@/data/projects";
import { getMessages, isLocale, localizedPath, type Locale } from "@/i18n/config";
import { localizeProject } from "@/i18n/project";
import { openGraph } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  return {
    title: "Genie — Digital Product Studio | Make Ideas Real.",
    description: t.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", ar: "/ar" },
    },
    openGraph: openGraph(locale, "Genie — Digital Product Studio | Make Ideas Real.", t.meta.description),
  };
}

export default function Home({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  const localized = projects.map((p) => localizeProject(p, locale, t.project));
  const workHref = localizedPath(locale, "/work");
  const contactHref = localizedPath(locale, "/contact");

  return (
    <>
      {/* ——— HERO ——— */}
      <section className="grain relative overflow-hidden pt-28 md:pt-40" aria-label="Introduction">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
          <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-violet-600/20 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 md:px-10">
          <p className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-zinc-400">
            <Image
              src="/logo/genie-logo.jpg"
              alt="Genie"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-md object-cover"
              priority
            />
            <span className="h-px w-10 bg-sky" aria-hidden="true" />
            {t.hero.eyebrow}
          </p>

          <h1 className="display mt-8 font-display text-[clamp(3rem,9vw,7.5rem)] font-bold text-white">
            {t.hero.titleA}
            <br />
            <span className="bg-gradient-to-r from-sky via-blue-500 to-violet-500 bg-clip-text text-transparent">
              {t.hero.titleB}
            </span>
          </h1>

          <div className="mt-10 flex flex-col gap-10 md:mt-14 md:flex-row md:items-end md:justify-between">
            <p className="max-w-xl text-lg leading-relaxed text-zinc-300 md:text-xl">
              {t.hero.supporting}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={workHref}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky"
              >
                {t.hero.explore}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
              </Link>
              <Link
                href={contactHref}
                className="inline-flex items-center gap-2 rounded-full border hairline px-7 py-3.5 text-sm font-medium text-white transition-colors hover:border-sky/60 hover:text-sky"
              >
                {t.hero.build}
              </Link>
            </div>
          </div>
        </div>

        {/* Interactive generative artwork */}
        <div className="relative mx-auto mt-14 max-w-7xl px-5 md:mt-20 md:px-10">
          <div className="relative h-[320px] overflow-hidden rounded-2xl border hairline bg-[#0A0A0F] md:h-[460px]">
            <HeroVisual />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-5 md:p-7">
              <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">
                {t.hero.canvasLabel}
              </p>
              <p className="hidden font-display text-5xl font-bold tracking-[0.2em] text-white/15 md:block" aria-hidden="true">
                GENIE
              </p>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            {t.hero.scroll}
          </p>
        </div>
      </section>

      {/* ——— SELECTED WORK ——— */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-36" aria-labelledby="work-heading">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.home.selectedEyebrow}</p>
              <h2 id="work-heading" className="display mt-4 font-display text-4xl font-bold text-white md:text-6xl">
                {t.home.selectedHeading}
              </h2>
            </div>
            <Link href={workHref} className="group inline-flex items-center gap-2 text-sm font-medium text-white">
              {t.home.allWork}
              <ArrowUpRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        <div className="mt-12 space-y-16 md:mt-16 md:space-y-24">
          {localized.map((project, i) => (
            <Reveal key={project.slug} delay={i * 0.05}>
              <article
                className={`grid items-center gap-8 md:grid-cols-12 ${
                  i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                <Link href={localizedPath(locale, `/work/${project.slug}`)} className="group block md:col-span-7" aria-label={`${project.name} — ${t.home.viewCaseStudy}`}>
                  <div className="transition-transform duration-500 group-hover:-translate-y-1.5">
                    <ProjectCover project={project} locale={locale} large />
                  </div>
                </Link>
                <div className="md:col-span-5">
                  <p className="font-mono text-xs text-zinc-500">0{i + 1} — {project.status}</p>
                  <h3 className="display mt-3 font-display text-3xl font-bold text-white md:text-4xl">
                    <Link href={localizedPath(locale, `/work/${project.slug}`)} className="transition-colors hover:text-sky">
                      {project.name}
                    </Link>
                  </h3>
                  <p className="mt-4 leading-relaxed text-zinc-400">{project.short}</p>
                  <p className="mt-4 text-sm text-zinc-500">{project.category}</p>
                  <Link
                    href={localizedPath(locale, `/work/${project.slug}`)}
                    className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-white"
                  >
                    {t.home.viewProject}
                    <ArrowRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ——— WHAT WE DO ——— */}
      <section className="border-t hairline bg-[#0A0A0F]" aria-labelledby="what-heading">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-36">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.home.whatEyebrow}</p>
            <h2 id="what-heading" className="display mt-4 max-w-3xl font-display text-4xl font-bold text-white md:text-6xl">
              {t.home.whatHeading}
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-zinc-400">
              {t.home.whatIntro}
            </p>
          </Reveal>
          <Capabilities items={t.capabilities} />
        </div>
      </section>

      {/* ——— OUR APPROACH ——— */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-36" aria-labelledby="approach-heading">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.home.approachEyebrow}</p>
          <h2 id="approach-heading" className="display mt-4 font-display text-4xl font-bold text-white md:text-6xl">
            {t.home.approachHeading}
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border hairline bg-white/10 md:mt-16 md:grid-cols-2 lg:grid-cols-4">
          {t.home.approach.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.06} className="bg-[#0A0A0F]">
              <div className="group flex h-full flex-col justify-between p-7 transition-colors hover:bg-[#101018] md:p-8">
                <div>
                  <p className="font-display text-5xl font-bold text-white/15 transition-colors group-hover:text-sky/60">
                    0{i + 1}
                  </p>
                  <h3 className="display mt-8 font-display text-2xl font-bold text-white">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-zinc-400">{step.text}</p>
                </div>
                <div className="mt-10 h-px w-full bg-gradient-to-r from-sky/60 via-blue-500/40 to-transparent rtl:bg-gradient-to-l" aria-hidden="true" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ——— PHILOSOPHY ——— */}
      <section className="border-t hairline bg-[#0A0A0F]" aria-labelledby="philosophy-heading">
        <div className="mx-auto max-w-4xl px-5 py-24 text-center md:px-10 md:py-36">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.home.philosophyEyebrow}</p>
            <blockquote className="display mt-8 font-display text-3xl font-bold leading-tight text-white md:text-5xl">
              &ldquo;{t.home.philosophyQuoteA}{" "}
              <span className="bg-gradient-to-r from-sky to-violet-400 bg-clip-text text-transparent">
                {t.home.philosophyQuoteB}
              </span>
              &rdquo;
            </blockquote>
            <p className="mx-auto mt-8 max-w-xl leading-relaxed text-zinc-400">
              {t.home.philosophyText}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ——— CLOSING CTA ——— */}
      <section className="relative overflow-hidden" aria-labelledby="cta-heading">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-1/2 h-72 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-24 text-center md:px-10 md:py-36">
          <Reveal>
            <h2 id="cta-heading" className="display mx-auto max-w-3xl font-display text-4xl font-bold text-white md:text-6xl">
              {t.home.closingHeading}
            </h2>
            <Link
              href={contactHref}
              className="group mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-medium text-black transition-colors hover:bg-sky"
            >
              {t.home.closingButton}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
