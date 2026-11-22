"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import ScrollProgress from "@/components/ScrollProgress";
import Footer from "@/components/Footer";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";

/**
 * Site chrome (progress bar, navbar, footer) around each page.
 * The Genie Model chat is a standalone full-screen page, like a chat
 * app: it renders its own top bar and no global navbar or footer.
 * Every other page keeps the normal chrome.
 */
export default function SiteChrome({
  locale,
  t,
  children,
}: {
  locale: Locale;
  t: Messages;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const isModelPage = segments[1] === "model";

  if (isModelPage) {
    return <main id="main">{children}</main>;
  }

  return (
    <>
      <ScrollProgress />
      <Navbar locale={locale} t={t} />
      <main id="main">{children}</main>
      <Footer locale={locale} t={t} />
    </>
  );
}
