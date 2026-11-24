import type { Metadata } from "next";
import PlannerApp from "@/components/PlannerApp";
import { isLocale, type Locale } from "@/i18n/config";
import { openGraph } from "@/lib/og";

const COPY = {
  en: {
    title: "Laha2ha — day planner (prototype)",
    description:
      "A first experimental Genie prototype: plan your day, see it checked by code, and replan when something runs late. No AI model and no calendar connection yet.",
  },
  ar: {
    title: "لحّقها — رتّب يومك (نسخة تجريبية)",
    description:
      "أول نموذج تجريبي من Genie: رتّب يومك، وشوفه مفحوص بالكود، وأعد ترتيبه لما حاجة تتأخر. لسه من غير موديل ذكاء اصطناعي ولا اتصال بالتقويم.",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const c = COPY[locale];
  return {
    title: c.title,
    description: c.description,
    alternates: {
      canonical: `/${locale}/planner`,
      languages: { en: "/en/planner", ar: "/ar/planner" },
    },
    openGraph: openGraph(locale, `${c.title} — Genie`, c.description),
  };
}

export default function PlannerPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-36 md:pb-32">
      <PlannerApp />
    </div>
  );
}
