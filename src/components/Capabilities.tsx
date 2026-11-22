"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Messages } from "@/i18n/messages/en";

/**
 * Editorial index, not a card grid: a large typographic list where each
 * row expands on hover / tap. One open at a time.
 */
export default function Capabilities({ items }: { items: Messages["capabilities"] }) {
  const [open, setOpen] = useState(0);
  return (
    <ul className="mt-12 border-t hairline md:mt-16">
      {items.map((cap, i) => {
        const active = open === i;
        return (
          <li key={cap.title} className="border-b hairline">
            <button
              type="button"
              onClick={() => setOpen(active ? -1 : i)}
              aria-expanded={active}
              className="group flex w-full items-center gap-4 py-6 text-start md:gap-8 md:py-8"
            >
              <span className={`font-mono text-xs md:text-sm ${active ? "text-sky" : "text-zinc-600"}`}>
                0{i + 1}
              </span>
              <span
                className={`display flex-1 font-display text-2xl font-bold transition-colors md:text-4xl ${
                  active ? "text-white" : "text-zinc-300 group-hover:text-white"
                }`}
              >
                {cap.title}
              </span>
              <ArrowUpRight
                className={`h-5 w-5 shrink-0 transition-all md:h-6 md:w-6 rtl:-scale-x-100 ${
                  active ? "rotate-45 text-sky" : "text-zinc-600 group-hover:text-white"
                }`}
                aria-hidden="true"
              />
            </button>
            <div
              className={`grid transition-all duration-300 ${
                active ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="max-w-2xl pb-7 ps-8 leading-relaxed text-zinc-400 md:ps-14 md:text-lg">
                  {cap.text}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
