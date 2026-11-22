"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The site's section system, in one place:
 * a numbered label + hairline rule row, then the heading revealing
 * line-by-line (clip + rise), then an optional intro line.
 * Every section on the home and about pages uses this — same rhythm,
 * same spacing, no ad-hoc headers.
 */
export default function SectionHeading({
  number,
  eyebrow,
  title,
  intro,
  id,
}: {
  number: string;
  eyebrow: string;
  title?: string;
  intro?: string;
  id?: string;
}) {
  const reduce = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease }}
        className="flex items-center gap-4"
      >
        <span className="font-mono text-xs text-sky">{number}</span>
        <span className="h-px w-10 bg-sky/60" aria-hidden="true" />
        <span className="text-xs uppercase tracking-[0.28em] text-zinc-400">
          {eyebrow}
        </span>
        <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
      </motion.div>

      {title ? (
        <div className="overflow-hidden">
          <motion.h2
            id={id}
            initial={reduce ? false : { y: "105%" }}
            whileInView={{ y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease }}
            className="display mt-6 font-display text-4xl font-bold text-white md:text-6xl"
          >
            {title}
          </motion.h2>
        </div>
      ) : null}

      {intro ? (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.12, ease }}
          className="mt-5 max-w-xl leading-relaxed text-zinc-400"
        >
          {intro}
        </motion.p>
      ) : null}
    </div>
  );
}
