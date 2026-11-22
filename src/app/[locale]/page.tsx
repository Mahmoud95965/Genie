import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import GlowPanel from "@/components/GlowPanel";
import ProjectCover from "@/components/ProjectCover";
import Reveal from "@/components/Reveal";
import Capabilities from "@/components/Capabilities";
import SectionHeading from "@/components/SectionHeading";
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
    title: "Genie — Digital Venture Studio | Make Ideas Real.",
    description: t.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", ar: "/ar" },
    },
    openGraph: openGraph(locale, "Genie — Digital Venture Studio | Make Ideas Real.", t.meta.description),
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
      <Hero hero={t.hero} workHref={workHref} contactHref={contactHref} />

      {/* ——— MARQUEE ——— */}
      <div className="mt-14 md:mt-20">
        <Marquee items={t.home.marquee} />
      </div>

      {/* ——— 01 · WHO WE ARE ——— */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32" aria-labelledby="who-heading">
        <div className="grid gap-10 md:grid-cols-12 md:gap-12">
          <div className="md:col-span-4">
            <div className="md:sticky md:top-28">
              <SectionHeading number="01" eyebrow={t.home.whoEyebrow} />
            </div>
          </div>
          <div className="md:col-span-8">
            <Reveal>
              <h2 id="who-heading" className="display font-display text-4xl font-bold leading-[1.05] text-white md:text-6xl">
                {t.home.whoHeading}
              </h2>
              <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
                {t.home.whoText1}
              </p>
              <p className="mt-5 max-w-2xl leading-relaxed text-zinc-400">
                {t.home.whoText2}
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ——— 02 · WHAT WE DO ——— */}
      <section className="border-y hairline bg-[#0A0A0F]" aria-labelledby="what-heading">
        <div className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32">
          <SectionHeading
            number="02"
            eyebrow={t.home.whatEyebrow}
            title={t.home.whatHeading}
            intro={t.home.whatIntro}
            id="what-heading"
          />
          <Capabilities items={t.capabilities} />
        </div>
      </section>

      {/* ——— 03 · VISION & MISSION ——— */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32" aria-labelledby="vision-heading">
        <SectionHeading
          number="03"
          eyebrow={t.home.visionEyebrow}
          id="vision-heading"
        />
        <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2">
          <Reveal>
            <GlowPanel className="h-full">
              <div className="flex h-full flex-col p-7 md:p-10">
                <p className="font-mono text-xs text-sky">01 — {t.home.visionHeading}</p>
                <p className="display mt-6 font-display text-2xl font-bold leading-snug text-white md:text-3xl">
                  {t.home.visionText}
                </p>
              </div>
            </GlowPanel>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="h-full rounded-2xl bg-gradient-to-br from-sky/70 via-blue-500/40 to-violet-500/70 p-px">
              <GlowPanel className="h-full border-0">
                <div className="flex h-full flex-col p-7 md:p-10">
                  <p className="font-mono text-xs text-sky">02 — {t.home.missionHeading}</p>
                  <p className="display mt-6 font-display text-2xl font-bold leading-snug text-white md:text-3xl">
                    {t.home.missionText}
                  </p>
                </div>
              </GlowPanel>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ——— 04 · SELECTED WORK ——— */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32" aria-labelledby="work-heading">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            number="04"
            eyebrow={t.home.selectedEyebrow}
            title={t.home.selectedHeading}
            intro={t.work.intro}
            id="work-heading"
          />
          <Link href={workHref} className="group inline-flex shrink-0 items-center gap-2 pb-1 text-sm font-medium text-white">
            {t.home.allWork}
            <ArrowUpRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

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

        <Reveal className="mt-14 md:mt-20">
          <p className="max-w-2xl border-s-2 border-sky/60 ps-5 leading-relaxed text-zinc-400">
            {t.home.futureVentures}
          </p>
        </Reveal>

        {/* ——— GENIE MODEL CTA ——— */}
        <Reveal className="mt-14 md:mt-20">
          <div className="rounded-3xl bg-gradient-to-br from-sky/70 via-blue-500/40 to-violet-500/70 p-px">
            <div className="panel flex flex-col items-start gap-6 rounded-3xl border-0 p-7 md:flex-row md:items-center md:justify-between md:p-10">
              <div>
                <h3 className="display font-display text-2xl font-bold text-white md:text-3xl">
                  {t.home.modelCtaHeading}
                </h3>
                <p className="mt-3 max-w-xl leading-relaxed text-zinc-400">
                  {t.home.modelCtaText}
                </p>
              </div>
              <Link
                href={localizedPath(locale, "/model")}
                className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky"
              >
                {t.home.modelCtaButton}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ——— 05 · HOW WE WORK ——— */}
      <section className="mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32" aria-labelledby="approach-heading">
        <SectionHeading
          number="05"
          eyebrow={t.home.approachEyebrow}
          title={t.home.approachHeading}
          id="approach-heading"
        />
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

      {/* ——— 06 · PHILOSOPHY ——— */}
      <section className="border-y hairline bg-[#0A0A0F]" aria-labelledby="philosophy-heading">
        <div className="mx-auto max-w-4xl px-5 py-24 text-center md:px-10 md:py-32">
          <Reveal>
            <p className="flex items-center justify-center gap-4 text-xs uppercase tracking-[0.28em] text-sky">
              <span className="font-mono tracking-normal text-sky">06</span>
              <span className="h-px w-10 bg-sky/60" aria-hidden="true" />
              {t.home.philosophyEyebrow}
              <span className="h-px w-10 bg-sky/60" aria-hidden="true" />
            </p>
            <blockquote className="display mt-8 font-display text-3xl font-bold leading-tight text-white md:text-5xl">
              &ldquo;{t.home.philosophyQuoteA}{" "}
              <span className="animate-shimmer bg-gradient-to-r from-sky via-blue-400 to-violet-400 bg-clip-text text-transparent">
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

      {/* ——— 07 · START A PROJECT ——— */}
      <section className="relative overflow-hidden" aria-labelledby="cta-heading">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-1/2 h-72 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 py-24 md:px-10 md:py-32">
          <Reveal>
            <div className="rounded-3xl bg-gradient-to-br from-sky/70 via-blue-500/40 to-violet-500/70 p-px">
              <div className="panel flex flex-col items-center rounded-3xl border-0 px-6 py-14 text-center md:px-10 md:py-20">
                <Image
                  src="/logo/genie-logo.jpg"
                  alt="Genie"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-2xl object-cover"
                />
                <p className="mt-6 flex items-center gap-4 text-xs uppercase tracking-[0.28em] text-sky">
                  <span className="font-mono tracking-normal text-sky">07</span>
                  <span className="h-px w-10 bg-sky/60" aria-hidden="true" />
                  {t.footer.startProject}
                </p>
                <h2 id="cta-heading" className="display mx-auto mt-6 max-w-3xl font-display text-4xl font-bold text-white md:text-6xl">
                  {t.home.futureHeading}
                </h2>
                <div className="mx-auto mt-8 max-w-2xl space-y-3">
                  {t.home.futureLines.map((line) => (
                    <p key={line} className="display font-display text-xl font-bold leading-snug text-zinc-200 md:text-2xl">
                      {line}
                    </p>
                  ))}
                </div>
                <p className="mx-auto mt-8 max-w-xl leading-relaxed text-zinc-400">
                  {t.home.futureClosing}
                </p>
                <Link
                  href={contactHref}
                  className="group mt-10 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-medium text-black transition-colors hover:bg-sky"
                >
                  {t.home.closingButton}
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
