import type { Metadata } from "next";
import ModelChat from "@/components/ModelChat";
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
    title: t.model.title,
    description: t.meta.modelDescription,
    alternates: {
      canonical: `/${locale}/model`,
      languages: { en: "/en/model", ar: "/ar/model" },
    },
    openGraph: openGraph(locale, `${t.model.title} — Genie`, t.meta.modelDescription),
  };
}

/**
 * Genie Model — a standalone, ChatGPT-like full-screen chat.
 * This page renders its own top bar and no global Navbar/Footer
 * (see SiteChrome in the locale layout). The chat shows what the
 * model can do and who it is for — no technical how-it-works details.
 */
export default function ModelPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = getMessages(locale);
  const otherLocale: Locale = locale === "en" ? "ar" : "en";

  return (
    <div className="flex h-dvh flex-col bg-[#050507]">
      <ModelChat
        t={t.model}
        mode="general"
        greeting={t.model.heading}
        suggestions={t.model.suggestions}
        locale={locale}
        switchTo={{
          locale: otherLocale,
          label: locale === "en" ? t.nav.switchToArabic : t.nav.switchToEnglish,
          href: localizedPath(otherLocale, "/model"),
          ariaLabel: t.nav.switchLabel,
        }}
      />
    </div>
  );
}
