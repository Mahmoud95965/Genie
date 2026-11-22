"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import GenieLetters from "@/components/GenieLetters";
import HeroVisual from "@/components/HeroVisual";
import type { Messages } from "@/i18n/messages/en";

/**
 * Hero — full-viewport, layered over the generative canvas.
 * Entrance choreography (delays via the `custom` prop, so each block
 * lands in sequence): eyebrow → GENIE letters gather from across the
 * screen → headline lines rise → supporting line + CTAs → scroll hint.
 * The gradient headline shimmers slowly (CSS, transform-free).
 * Reduced motion renders everything statically, letters assembled.
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

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 28 },
    show: (delay: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease, delay },
    }),
  };
  const line: Variants = {
    hidden: { y: "110%" },
    show: (delay: number = 0) => ({
      y: 0,
      transition: { duration: 0.9, ease, delay },
    }),
  };

  return (
    <section
      className="grain relative flex min-h-[100svh] flex-col overflow-hidden"
      aria-label="Introduction"
    >
      {/* Full-screen generative background (canvas + glow) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <HeroVisual />
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#050507] to-transparent" />
      </div>

      {/* Content — centred vertically in the viewport */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 pb-10 pt-28 md:px-10">
        <motion.p
          variants={fadeUp}
          custom={0.1}
          initial={reduce ? false : "hidden"}
          animate="show"
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

        <GenieLetters />

        <h1 className="display mt-8 font-display text-[clamp(2.5rem,7vw,5.5rem)] font-bold text-white md:mt-10">
          <span className="block overflow-hidden pb-1">
            <motion.span variants={line} custom={0.95} initial={reduce ? false : "hidden"} animate="show" className="block">
              {hero.titleA}
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-2">
            <motion.span
              variants={line}
              custom={1.04}
              initial={reduce ? false : "hidden"}
              animate="show"
              className="animate-shimmer block bg-gradient-to-r from-sky via-blue-500 to-violet-500 bg-clip-text text-transparent"
            >
              {hero.titleB}
            </motion.span>
          </span>
        </h1>

        <motion.div
          variants={fadeUp}
          custom={1.2}
          initial={reduce ? false : "hidden"}
          animate="show"
          className="mt-10 flex flex-col gap-10 md:mt-12 md:flex-row md:items-end md:justify-between"
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
      </div>

      {/* Scroll hint — pinned to the bottom of the viewport */}
      <motion.p
        variants={fadeUp}
        custom={1.5}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="relative z-10 mx-auto flex w-full max-w-7xl items-center gap-2 px-5 pb-8 text-xs text-zinc-500 md:px-10"
      >
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        {hero.scroll}
      </motion.p>
    </section>
  );
}
