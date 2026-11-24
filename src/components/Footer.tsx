import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/config/site";
import { localizedPath, type Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/en";

export default function Footer({ locale, t }: { locale: Locale; t: Messages }) {
  const socials = Object.entries(siteConfig.socials).filter(([, href]) => href);
  const navItems = [
    { label: t.nav.home, href: localizedPath(locale, "/") },
    { label: t.nav.work, href: localizedPath(locale, "/work") },
    { label: t.nav.about, href: localizedPath(locale, "/about") },
    { label: t.nav.contact, href: localizedPath(locale, "/contact") },
  ];
  const workLinks = [
    { label: "Port Said Hub", href: localizedPath(locale, "/work/port-said-hub") },
    { label: "Laha2ha — day planner (prototype)", href: localizedPath(locale, "/planner") },
  ];

  return (
    <footer className="border-t hairline bg-[#050507]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link href={localizedPath(locale, "/")} className="flex items-center gap-3" aria-label="Genie — home">
              <Image
                src="/logo/genie-logo.jpg"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
              <span className="font-display text-2xl font-bold tracking-[0.18em] text-white">
                GENIE
              </span>
            </Link>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              {t.footer.tagline}
            </p>
            <p className="mt-2 text-sm text-zinc-500">{t.footer.makeReal}</p>
          </div>

          <nav aria-label="Footer navigation" className="flex gap-16">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{t.footer.site}</p>
              <ul className="mt-4 space-y-3">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm text-zinc-300 transition-colors hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{t.footer.work}</p>
              <ul className="mt-4 space-y-3">
                {workLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm text-zinc-300 transition-colors hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{t.footer.startProject}</p>
            <Link
              href={localizedPath(locale, "/contact")}
              className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white"
            >
              {t.footer.buildSomething}
              <ArrowUpRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" aria-hidden="true" />
            </Link>
            {socials.length > 0 && (
              <ul className="mt-6 space-y-2">
                {socials.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm capitalize text-zinc-400 transition-colors hover:text-white"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t hairline pt-6 text-xs text-zinc-600 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} {t.footer.rights}</p>
          <p>{t.footer.newIdentity}</p>
        </div>
      </div>
    </footer>
  );
}
