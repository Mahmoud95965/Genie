import type { Metadata } from "next";
import ModelChat from "@/components/ModelChat";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import { getMessages, isLocale, type Locale } from "@/i18n/config";
import { openGraph } from "@/lib/og";

const FREE_MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "inclusionai/ling-3.2-flash:free",
] as const;

const EXAMPLE_REQUEST = `curl https://openrouter.ai/api/v1/chat/completions \\
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "google/gemma-4-31b-it:free",
    "messages": [{ "role": "user", "content": "Hello, Genie!" }]
  }'`;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  return {
    title: t.model.title,
    description: t.meta.modelDescription,
    alternates: {
      canonical: `/${locale}/model`,
      languages: { en: "/en/model", ar: "/ar/model" },
    },
    openGraph: openGraph(locale, `${t.model.title} — Genie`, t.meta.modelDescription),
  };
}

export default function ModelPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);

  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.28em] text-sky">{t.model.eyebrow}</p>
        <h1 className="display mt-4 max-w-3xl font-display text-5xl font-bold text-white md:text-7xl">
          {t.model.heading}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
          {t.model.intro}
        </p>
        <p className="mt-4 inline-flex rounded-full border border-sky/30 bg-sky/5 px-4 py-1.5 text-sm text-sky">
          {t.model.limitNote}
        </p>
      </Reveal>

      <Reveal className="mt-12 md:mt-16">
        <ModelChat t={t.model} />
      </Reveal>

      {/* ——— HOW TO CONNECT ——— */}
      <section className="mt-20 border-t hairline pt-12 md:mt-24" aria-labelledby="connect-heading">
        <SectionHeading
          number="01"
          eyebrow={t.model.connectHeading}
          title={t.model.connectHeading}
          intro={t.model.connectIntro}
          id="connect-heading"
        />
        <div className="mt-10 grid gap-6 md:mt-12 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-2xl border hairline bg-[#0A0A0F] p-7">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                {t.model.connectEndpointLabel}
              </p>
              <p dir="ltr" className="mt-4 break-all font-mono text-sm text-sky">
                https://openrouter.ai/api/v1/chat/completions
              </p>
              <p className="mt-6 text-xs uppercase tracking-[0.2em] text-zinc-500">
                {t.model.connectModelsLabel}
              </p>
              <ul dir="ltr" className="mt-4 space-y-2 text-left font-mono text-sm text-zinc-300">
                {FREE_MODELS.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <a
                href="https://openrouter.ai/docs"
                target="_blank"
                rel="noreferrer"
                className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-white transition-colors hover:text-sky"
              >
                {t.model.connectDocs}
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="h-full rounded-2xl border hairline bg-[#0A0A0F] p-7">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                {t.model.connectExample}
              </p>
              <pre
                dir="ltr"
                className="mt-4 overflow-x-auto whitespace-pre rounded-xl bg-[#050507] p-4 text-left font-mono text-[13px] leading-relaxed text-zinc-300"
              >
                {EXAMPLE_REQUEST}
              </pre>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
