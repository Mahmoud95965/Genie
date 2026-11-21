"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

const capabilities = [
  {
    n: "01",
    title: "Digital Product Development",
    text: "From the first sketch to a product people rely on — scoped honestly, built to last, and shipped in working increments.",
  },
  {
    n: "02",
    title: "Web Platforms",
    text: "Platforms that organise something real: cities, services, communities. Built to scale with the people who use them.",
  },
  {
    n: "03",
    title: "UI/UX Design",
    text: "Interfaces that get out of the way. Clear hierarchy, honest copy, and flows designed around what a person is trying to do.",
  },
  {
    n: "04",
    title: "AI-Powered Experiences",
    text: "AI where it earns its place — assistants that answer real questions, tools that save real time. Never AI for the sake of it.",
  },
  {
    n: "05",
    title: "Digital Ecosystems",
    text: "Products that connect: directories, maps, accounts, admin tools — one coherent system instead of five disconnected ones.",
  },
  {
    n: "06",
    title: "Interactive Experiences",
    text: "Motion, generative visuals and interaction used with intent — to make an idea felt, not just read.",
  },
];

/**
 * Editorial index, not a card grid: a large typographic list where each
 * row expands on hover / tap. One open at a time.
 */
export default function Capabilities() {
  const [open, setOpen] = useState(0);
  return (
    <ul className="mt-12 border-t hairline md:mt-16">
      {capabilities.map((cap, i) => {
        const active = open === i;
        return (
          <li key={cap.n} className="border-b hairline">
            <button
              type="button"
              onClick={() => setOpen(active ? -1 : i)}
              aria-expanded={active}
              className="group flex w-full items-center gap-4 py-6 text-left md:gap-8 md:py-8"
            >
              <span className={`font-mono text-xs md:text-sm ${active ? "text-sky" : "text-zinc-600"}`}>
                {cap.n}
              </span>
              <span
                className={`display flex-1 font-display text-2xl font-bold transition-colors md:text-4xl ${
                  active ? "text-white" : "text-zinc-300 group-hover:text-white"
                }`}
              >
                {cap.title}
              </span>
              <ArrowUpRight
                className={`h-5 w-5 shrink-0 transition-all md:h-6 md:w-6 ${
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
                <p className="max-w-2xl pb-7 pl-8 leading-relaxed text-zinc-400 md:pl-14 md:text-lg">
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
