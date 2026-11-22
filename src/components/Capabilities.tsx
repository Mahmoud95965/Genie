"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Lightbulb,
  MousePointerClick,
  Network,
  Package,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Messages } from "@/i18n/messages/en";

/**
 * The five pillars as a structured grid — 3 cards on the first row,
 * 2 on the second. Each card reveals on scroll (staggered), lifts on
 * hover, and its icon tilts/scales as a micro-motion. Icons are fixed
 * by pillar order; titles and text come from the dictionaries.
 */
const ICONS: LucideIcon[] = [
  Package, // Digital Products
  Network, // Digital Platforms
  Sparkles, // Technology & AI
  MousePointerClick, // Digital Experiences
  Lightbulb, // Innovation
];

export default function Capabilities({ items }: { items: Messages["capabilities"] }) {
  const reduce = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-6">
      {items.map((cap, i) => {
        const Icon = ICONS[i] ?? Package;
        const span = i < 3 ? "md:col-span-2" : "md:col-span-3";
        return (
          <motion.article
            key={cap.title}
            initial={reduce ? false : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, delay: i * 0.07, ease }}
            className={`panel group relative flex flex-col overflow-hidden p-7 transition-transform duration-300 hover:-translate-y-1.5 md:p-8 ${span}`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border hairline bg-white/[0.03] text-sky transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-xs text-zinc-600">0{i + 1}</span>
            </div>
            <h3 className="display mt-7 font-display text-2xl font-bold text-white">
              {cap.title}
            </h3>
            <p className="mt-3 leading-relaxed text-zinc-400">{cap.text}</p>
            <div
              aria-hidden="true"
              className="mt-8 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-sky via-blue-500 to-violet-500 transition-transform duration-500 group-hover:scale-x-100 rtl:origin-right"
            />
          </motion.article>
        );
      })}
    </div>
  );
}
