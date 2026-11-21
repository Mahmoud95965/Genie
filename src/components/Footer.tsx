import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/config/site";

export default function Footer() {
  const socials = Object.entries(siteConfig.socials).filter(([, href]) => href);
  return (
    <footer className="border-t hairline bg-[#050507]">
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-10 md:py-20">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <p className="font-display text-2xl font-bold tracking-[0.18em] text-white">
              GENIE
            </p>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              We turn ideas into digital experiences.
            </p>
            <p className="mt-2 text-sm text-zinc-500">Make Ideas Real.</p>
          </div>

          <nav aria-label="Footer navigation" className="flex gap-16">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Site</p>
              <ul className="mt-4 space-y-3">
                {[...siteConfig.nav, { label: "Contact", href: "/contact" }].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="text-sm text-zinc-300 transition-colors hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Work</p>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link href="/work/port-said-hub" className="text-sm text-zinc-300 transition-colors hover:text-white">
                    Port Said Hub
                  </Link>
                </li>
                <li>
                  <Link href="/work/qena-services" className="text-sm text-zinc-300 transition-colors hover:text-white">
                    Qena Services Platform
                  </Link>
                </li>
                <li>
                  <Link href="/work/genie-experiments" className="text-sm text-zinc-300 transition-colors hover:text-white">
                    Genie Experiments
                  </Link>
                </li>
              </ul>
            </div>
          </nav>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Start a project</p>
            <Link
              href="/contact"
              className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-white"
            >
              Let&rsquo;s build something
              <ArrowUpRight className="h-4 w-4 text-sky transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
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
          <p>© {new Date().getFullYear()} Genie — Digital Product Studio.</p>
          <p>Genie is a new independent identity.</p>
        </div>
      </div>
    </footer>
  );
}
