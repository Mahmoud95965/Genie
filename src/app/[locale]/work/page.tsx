import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ProjectCover from "@/components/ProjectCover";
import Reveal from "@/components/Reveal";
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
    title: t.nav.work,
    description: t.meta.workDescription,
    alternates: {
      canonical: `/${locale}/work`,
      languages: { en: "/en/work", ar: "/ar/work" },
    },
    openGraph: openGraph(locale, `${t.nav.work} — Genie`, t.meta.workDescription),
  };
}

export default function WorkPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  const localized = projects.map((p) => localizeProject(p, locale, t.project));
  const contactHref = localizedPath(locale, "/contact");

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.work.eyebrow}</p>
        <h1 className="display mt-4 max-w-3xl font-display text-5xl font-bold text-white md:text-7xl">
          {t.work.heading}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
          {t.work.intro}
        </p>
      </Reveal>

      <div className="mt-14 space-y-16 md:mt-20 md:space-y-24">
        {localized.map((project, i) => (
          <Reveal key={project.slug} delay={i * 0.05}>
            <article className={`grid items-center gap-8 md:grid-cols-12 ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <Link href={localizedPath(locale, `/work/${project.slug}`)} className="group block md:col-span-7" aria-label={`${project.name} — ${t.home.viewCaseStudy}`}>
                <div className="transition-transform duration-500 group-hover:-translate-y-1.5">
                  <ProjectCover project={project} locale={locale} large />
                </div>
              </Link>
              <div className="md:col-span-5">
                <p className="font-mono text-xs text-zinc-500">0{i + 1} — {project.status}</p>
                <h2 className="display mt-3 font-display text-3xl font-bold text-white md:text-4xl">
                  <Link href={localizedPath(locale, `/work/${project.slug}`)} className="transition-colors hover:text-sky">
                    {project.name}
                  </Link>
                </h2>
                <p className="mt-4 leading-relaxed text-zinc-400">{project.short}</p>
                <p className="mt-4 text-sm text-zinc-500">{project.category}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {project.stack.map((s) => (
                    <span key={s} className="rounded-full border hairline px-3 py-1 text-xs text-zinc-300">{s}</span>
                  ))}
                </div>
                <Link href={localizedPath(locale, `/work/${project.slug}`)} className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-white">
                  {t.home.viewProject}
                  <ArrowRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-24 border-t hairline pt-12 text-center">
        <p className="display font-display text-2xl font-bold text-white md:text-3xl">
          {t.home.closingHeading}
        </p>
        <Link href={contactHref} className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky">
          {t.home.closingButton}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Reveal>
    </div>
  );
}
