import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "About",
  description:
    "Genie is a new independent digital product studio. Our vision, philosophy, what we believe, how we work, and our ambitions.",
};

const beliefs = [
  {
    title: "Useful beats impressive",
    text: "A product earns its place by being used, not by looking clever in a demo. If it doesn't help someone do something real, it isn't finished — it isn't even started.",
  },
  {
    title: "Design is a decision",
    text: "Every screen, every word, every interaction is a choice about what matters. Good design is making those choices deliberately, and being able to explain them.",
  },
  {
    title: "Small, done well",
    text: "We would rather build one thing properly than five things half-done. Focus is what lets a small studio do work that holds up.",
  },
  {
    title: "Build in the open, learn in public",
    text: "Experiments are part of the work, not a side project. Trying something, learning from it, and keeping only what works — that's how products get better.",
  },
];

const ways = [
  { n: "01", title: "Start with the problem", text: "Before any design or code, we work to understand who this is for and what is actually broken. A clear problem is half the product." },
  { n: "02", title: "Keep the team close to the work", text: "The people designing are the people building. Fewer handoffs, fewer misunderstandings, faster honest feedback." },
  { n: "03", title: "Ship, then listen", text: "A product in people's hands teaches more than any plan. We ship working versions early and let real use shape what comes next." },
  { n: "04", title: "Stay after launch", text: "Launch is a beginning. Products grow, break, and change — and we stay to improve them as they do." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.28em] text-sky">About</p>
        <h1 className="display mt-4 max-w-4xl font-display text-5xl font-bold leading-[1.02] text-white md:text-7xl">
          A new studio, built around one belief.
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
          Genie is a new independent technology identity. We build useful
          digital products and experiences through technology, creativity, and
          thoughtful execution — and we judge our work by whether it makes
          something better for the people who use it.
        </p>
      </Reveal>

      {/* Vision */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="vision-heading">
        <Reveal>
          <div className="grid gap-8 md:grid-cols-12">
            <h2 id="vision-heading" className="display font-display text-3xl font-bold text-white md:col-span-4 md:text-4xl">Our vision</h2>
            <div className="md:col-span-8">
              <p className="text-lg leading-relaxed text-zinc-300 md:text-xl">
                A world where good ideas don&rsquo;t die in a notebook. Where
                the distance between &ldquo;someone should build this&rdquo;
                and &ldquo;this exists, and it works&rdquo; is as short as
                possible.
              </p>
              <p className="mt-5 leading-relaxed text-zinc-400">
                That is what Genie is for: turning ambitious ideas into digital
                products, platforms, and experiences that people can actually
                use — starting with real problems in real places, like Port
                Said and Qena, and growing from there.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Philosophy */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="philosophy-heading">
        <Reveal>
          <div className="grid gap-8 md:grid-cols-12">
            <h2 id="philosophy-heading" className="display font-display text-3xl font-bold text-white md:col-span-4 md:text-4xl">Our philosophy</h2>
            <div className="md:col-span-8">
              <blockquote className="display font-display text-2xl font-bold leading-snug text-white md:text-3xl">
                &ldquo;Technology should do more than exist. It should make
                something better.&rdquo;
              </blockquote>
              <p className="mt-6 leading-relaxed text-zinc-400">
                Useful technology, thoughtful design, meaningful experiences.
                We build things that have a reason to exist — and we are
                comfortable leaving the rest unbuilt. Restraint is part of the
                craft: fewer features, done properly, beat a long list of
                half-finished ones.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* What we believe */}
      <section className="mt-20 border-t hairline pt-14 md:mt-28" aria-labelledby="beliefs-heading">
        <Reveal>
          <h2 id="beliefs-heading" className="display font-display text-3xl font-bold text-white md:text-4xl">What we believe</h2>
        </Reveal>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border hairline bg-white/10 md:grid-cols-2">
          {beliefs.map((b, i) => (
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
          <h2 id="how-heading" className="display font-display text-3xl font-bold text-white md:text-4xl">How we work</h2>
          <p className="mt-4 max-w-xl leading-relaxed text-zinc-400">
            The same approach behind every project — discover, define, build,
            evolve — applied as a working habit, not a slide.
          </p>
        </Reveal>
        <ol className="mt-10 space-y-0 border-t hairline">
          {ways.map((w) => (
            <Reveal key={w.n}>
              <li className="grid gap-3 border-b hairline py-7 md:grid-cols-12 md:gap-8 md:py-9">
                <span className="font-display text-2xl font-bold text-sky/80 md:col-span-2">{w.n}</span>
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
            <h2 id="ambitions-heading" className="display font-display text-3xl font-bold text-white md:col-span-4 md:text-4xl">Our ambitions</h2>
            <div className="md:col-span-8">
              <p className="text-lg leading-relaxed text-zinc-300">
                To build products that outlast their launch. To keep learning
                in public through experiments. And to grow, project by
                project, into a studio whose name means something simple: if
                Genie built it, it works, and it matters.
              </p>
              <p className="mt-5 leading-relaxed text-zinc-400">
                We are at the beginning. That is not a disclaimer — it is the
                honest starting point, and the work on this site is the
                evidence so far.
              </p>
              <Link
                href="/contact"
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky"
              >
                Start a conversation
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
