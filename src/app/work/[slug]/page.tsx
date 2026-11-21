import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, FlaskConical, Hammer } from "lucide-react";
import ProjectCover from "@/components/ProjectCover";
import Reveal from "@/components/Reveal";
import { getProject, getProjectSlugs, projects } from "@/data/projects";

export function generateStaticParams() {
  return getProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const project = getProject(params.slug);
  if (!project) return { title: "Project not found" };
  return {
    title: project.name,
    description: project.short,
    openGraph: { title: `${project.name} — Genie`, description: project.short },
  };
}

export default function ProjectPage({ params }: { params: { slug: string } }) {
  const project = getProject(params.slug);
  if (!project) notFound();

  const others = projects.filter((p) => p.slug !== project.slug);
  const sections = [
    { label: "Challenge", text: project.challenge },
    { label: "Concept", text: project.concept },
    { label: "Design direction", text: project.design },
    { label: "Development", text: project.development },
  ];

  return (
    <article className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <Reveal>
        <Link href="/work" className="group inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          All work
        </Link>
        <p className="mt-10 text-xs uppercase tracking-[0.28em] text-sky">
          {project.category} — {project.status}
        </p>
        <h1 className="display mt-4 font-display text-5xl font-bold text-white md:text-7xl">{project.name}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">{project.short}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {project.stack.map((s) => (
            <span key={s} className="rounded-full border hairline px-3 py-1 text-xs text-zinc-300">{s}</span>
          ))}
        </div>
      </Reveal>

      {project.note && (
        <Reveal className="mt-10">
          <p className="flex max-w-2xl items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-5 py-4 text-sm leading-relaxed text-amber-200/90">
            {project.status === "Concept / Experiment" ? (
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Hammer className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {project.note}
          </p>
        </Reveal>
      )}

      <Reveal className="mt-10 md:mt-14">
        <ProjectCover project={project} large />
      </Reveal>

      <div className="mt-14 grid gap-12 md:mt-20 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-8">
          {sections.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.04}>
              <section className="border-t hairline py-8 first:border-t-0 first:pt-0">
                <h2 className="display font-display text-2xl font-bold text-white md:text-3xl">{s.label}</h2>
                <p className="mt-4 max-w-2xl leading-relaxed text-zinc-400 md:text-lg">{s.text}</p>
              </section>
            </Reveal>
          ))}
        </div>

        <aside className="md:col-span-4">
          <Reveal>
            <div className="rounded-2xl border hairline bg-[#0A0A0F] p-7">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Project</p>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-zinc-500">Status</dt>
                  <dd className="mt-1 text-white">{project.status}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Category</dt>
                  <dd className="mt-1 text-white">{project.category}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Stack</dt>
                  <dd className="mt-1 text-white">{project.stack.join(" · ")}</dd>
                </div>
              </dl>
              {project.links.length > 0 && (
                <div className="mt-7 border-t hairline pt-6">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Links</p>
                  <ul className="mt-4 space-y-3">
                    {project.links.map((link) => (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="group inline-flex items-center gap-1.5 text-sm font-medium text-white transition-colors hover:text-sky"
                        >
                          {link.label}
                          <ArrowUpRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Reveal>
        </aside>
      </div>

      <section className="mt-20 border-t hairline pt-12" aria-labelledby="more-heading">
        <h2 id="more-heading" className="display font-display text-2xl font-bold text-white md:text-3xl">More work</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {others.map((p) => (
            <Link key={p.slug} href={`/work/${p.slug}`} className="group block">
              <ProjectCover project={p} />
              <p className="mt-4 flex items-center justify-between font-display text-xl font-bold text-white">
                {p.name}
                <ArrowRight className="h-5 w-5 text-sky transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </p>
              <p className="mt-1 text-sm text-zinc-500">{p.category} — {p.status}</p>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
