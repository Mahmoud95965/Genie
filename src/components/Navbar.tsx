"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { siteConfig } from "@/config/site";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when the mobile menu is open; close on route change.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open ]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled && !open
            ? "border-b hairline bg-[#050507]/85 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <nav
          className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:h-[72px] md:px-10"
          aria-label="Main navigation"
        >
          <Link
            href="/"
            className="group flex items-baseline gap-2"
            aria-label="Genie — home"
          >
            <span className="font-display text-[22px] font-bold tracking-[0.18em] text-white">
              GENIE
            </span>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-sky sm:inline-block" aria-hidden="true" />
            <span className="hidden text-[11px] uppercase tracking-[0.2em] text-zinc-500 transition-colors group-hover:text-zinc-300 md:inline">
              Digital Product Studio
            </span>
          </Link>

          <ul className="hidden items-center gap-9 md:flex">
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={`text-sm transition-colors ${
                    pathname === item.href
                      ? "text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <Link
              href="/contact"
              className="group hidden items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-sky sm:inline-flex"
            >
              Let&rsquo;s Talk
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border hairline text-white md:hidden"
            >
              {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu — a full-screen experience, not a compressed desktop menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 flex flex-col justify-between bg-[#050507] px-5 pb-10 pt-28 md:hidden"
          >
            <nav aria-label="Mobile navigation">
              <ul className="space-y-2">
                {[...siteConfig.nav, { label: "Contact", href: "/contact" }].map((item, i) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.06, duration: 0.4 }}
                  >
                    <Link
                      href={item.href}
                      className="group flex items-baseline justify-between border-b hairline py-5"
                    >
                      <span className="font-display text-4xl font-semibold tracking-tight text-white">
                        {item.label}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">
                        0{i + 1}
                      </span>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <p className="text-sm text-zinc-400">Make Ideas Real.</p>
              <p className="mt-1 text-sm text-zinc-600">
                A new independent digital product studio.
              </p>
              <Link
                href="/contact"
                className="mt-6 flex items-center justify-center gap-2 rounded-full bg-white py-4 text-base font-medium text-black"
              >
                Let&rsquo;s Talk
                <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
