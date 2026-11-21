import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ProjectCover from "@/components/ProjectCover";
import Reveal from "@/components/Reveal";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected work from Genie — Port Said Hub, Qena Services Platform, and Genie Experiments. Real projects, honestly labelled.",
};

export default function WorkPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.28em] text-sky">Work</p>
        <h1 className="display mt-4 max-w-3xl font-display text-5xl font-bold text-white md:text-7xl">
          Work that exists.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
          Every project here is real. Live work is labelled live; unfinished
          work is labelled exactly what it is — in development, or an
          experiment.
        </p>
      </Reveal>

      <div className="mt-14 space-y-16 md:mt-20 md:space-y-24">
        {projects.map((project, i) => (
          <Reveal key={project.slug} delay={i * 0.05}>
            <article className={`grid items-center gap-8 md:grid-cols-12 ${i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""}`}>
              <Link href={`/work/${project.slug}`} className="group block md:col-span-7" aria-label={`${project.name} — view case study`}>
                <div className="transition-transform duration-500 group-hover:-translate-y-1.5">
                  <ProjectCover project={project} large />
                </div>
              </Link>
              <div className="md:col-span-5">
                <p className="font-mono text-xs text-zinc-500">0{i + 1} — {project.status}</p>
                <h2 className="display mt-3 font-display text-3xl font-bold text-white md:text-4xl">
                  <Link href={`/work/${project.slug}`} className="transition-colors hover:text-sky">
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
                <Link href={`/work/${project.slug}`} className="group mt-6 inline-flex items-center gap-2 text-sm font-medium text-white">
                  View project
                  <ArrowRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-24 border-t hairline pt-12 text-center">
        <p className="display font-display text-2xl font-bold text-white md:text-3xl">
          Have an idea? Let&rsquo;s make it real.
        </p>
        <Link href="/contact" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky">
          Start a conversation
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Reveal>
    </div>
  );
}
