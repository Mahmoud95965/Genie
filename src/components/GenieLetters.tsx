"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * GENIE wordmark — letter assembly.
 * The five letters start scattered across the viewport (deterministic
 * vw/vh offsets, so SSR and CSR render identically) and spring into
 * place one after another, each chased by a small glow dot that lags
 * behind and fades as the letter lands. The wordmark is the brand
 * name: Latin letters on every locale (dir="ltr" keeps the order
 * G-E-N-I-E on RTL pages). Screen readers get the word once via
 * role="img" + aria-label; the individual letters are aria-hidden.
 * Reduced motion renders the word already assembled.
 */
const LETTERS = [
  { ch: "G", x: "-38vw", y: "-30vh", rotate: -24 },
  { ch: "E", x: "36vw", y: "-26vh", rotate: 18 },
  { ch: "N", x: "-40vw", y: "28vh", rotate: -14 },
  { ch: "I", x: "34vw", y: "32vh", rotate: 22 },
  { ch: "E", x: "4vw", y: "-40vh", rotate: -8 },
] as const;

export default function GenieLetters() {
  const reduce = useReducedMotion();

  return (
    <div
      dir="ltr"
      role="img"
      aria-label="Genie"
      className="relative mt-6 flex justify-center md:mt-8"
    >
      {/* Soft glow behind the assembled word */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-40 w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/25 blur-[90px]"
      />
      <div className="animate-shimmer flex bg-gradient-to-r from-sky via-blue-500 to-violet-500 bg-clip-text font-display text-[clamp(3.5rem,18vw,10rem)] font-bold leading-none text-transparent">
        {LETTERS.map((letter, i) => (
          <span key={`${letter.ch}-${i}`} aria-hidden="true" className="relative inline-block">
            <motion.span
              className="inline-block"
              initial={
                reduce
                  ? false
                  : { x: letter.x, y: letter.y, rotate: letter.rotate, opacity: 0, filter: "blur(10px)" }
              }
              animate={{ x: 0, y: 0, rotate: 0, opacity: 1, filter: "blur(0px)" }}
              transition={{
                type: "spring",
                stiffness: 60,
                damping: 14,
                delay: 0.25 + i * 0.12,
              }}
            >
              {letter.ch}
            </motion.span>
            {/* Trailing glow dot — starts at the same scattered spot,
                lags behind the letter, and fades out as it lands. */}
            {!reduce && (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky/70 blur-lg"
                initial={{ x: letter.x, y: letter.y, opacity: 0.9, scale: 1.4 }}
                animate={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
                transition={{
                  delay: 0.25 + i * 0.12 + 0.45,
                  duration: 0.7,
                  ease: "easeOut",
                }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
