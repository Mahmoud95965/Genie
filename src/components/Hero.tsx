"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import HeroVisual from "@/components/HeroVisual";
import type { Messages } from "@/i18n/messages/en";

/**
 * Hero — entrance choreography: eyebrow → headline lines (each line
 * rises out of a clip) → supporting line → CTAs → canvas. The gradient
 * headline shimmers slowly (CSS, transform-free). Reduced motion renders
 * everything statically.
 */
export default function Hero({
  hero,
  workHref,
  contactHref,
}: {
  hero: Messages["hero"];
  workHref: string;
  contactHref: string;
}) {
  const reduce = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
  };
  const line: Variants = {
    hidden: { y: "110%" },
    show: { y: 0, transition: { duration: 0.9, ease } },
  };

  return (
    <section className="grain relative overflow-hidden pt-28 md:pt-40" aria-label="Introduction">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-violet-600/20 blur-[120px]" />
      </div>

      <motion.div
        variants={container}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="relative mx-auto max-w-7xl px-5 md:px-10"
      >
        <motion.p
          variants={item}
          className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-zinc-400"
        >
          <Image
            src="/logo/genie-logo.jpg"
            alt="Genie"
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-md object-cover"
            priority
          />
          <span className="h-px w-10 bg-sky" aria-hidden="true" />
          {hero.eyebrow}
        </motion.p>

        <h1 className="display mt-8 font-display text-[clamp(3rem,9vw,7.5rem)] font-bold text-white">
          <span className="block overflow-hidden pb-1">
            <motion.span variants={line} className="block">
              {hero.titleA}
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-2">
            <motion.span
              variants={line}
              className="animate-shimmer block bg-gradient-to-r from-sky via-blue-500 to-violet-500 bg-clip-text text-transparent"
            >
              {hero.titleB}
            </motion.span>
          </span>
        </h1>

        <motion.div
          variants={item}
          className="mt-10 flex flex-col gap-10 md:mt-14 md:flex-row md:items-end md:justify-between"
        >
          <p className="max-w-xl text-lg leading-relaxed text-zinc-300 md:text-xl">
            {hero.supporting}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={workHref}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-medium text-black transition-colors hover:bg-sky"
            >
              {hero.explore}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" aria-hidden="true" />
            </Link>
            <Link
              href={contactHref}
              className="inline-flex items-center gap-2 rounded-full border hairline px-7 py-3.5 text-sm font-medium text-white transition-colors hover:border-sky/60 hover:text-sky"
            >
              {hero.build}
            </Link>
          </div>
        </motion.div>
      </motion.div>

      {/* Interactive generative artwork */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.55, ease }}
        className="relative mx-auto mt-14 max-w-7xl px-5 md:mt-20 md:px-10"
      >
        <div className="relative h-[320px] overflow-hidden rounded-2xl border hairline bg-[#0A0A0F] md:h-[460px]">
          <HeroVisual />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-5 md:p-7">
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">
              {hero.canvasLabel}
            </p>
            <p className="hidden font-display text-5xl font-bold tracking-[0.2em] text-white/15 md:block" aria-hidden="true">
              GENIE
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          {hero.scroll}
        </p>
      </motion.div>
    </section>
  );
}
