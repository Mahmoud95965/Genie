"use client";

/**
 * Infinite marquee strip — the tagline and the five pillar keywords.
 * Two identical copies of the row scroll seamlessly (translateX -50%
 * loops cleanly in both LTR and RTL flow); the animation pauses on hover.
 * The content is repeated elsewhere on the page, so the strip is hidden
 * from assistive technology to avoid duplicate announcements.
 */
export default function Marquee({ items }: { items: string[] }) {
  const row = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {items.map((item) => (
        <span key={item} className="flex items-center">
          <span className="whitespace-nowrap px-6 font-display text-xl font-bold text-white/80 md:px-10 md:text-2xl">
            {item}
          </span>
          <span className="h-2 w-2 rotate-45 bg-sky" aria-hidden="true" />
        </span>
      ))}
    </div>
  );

  return (
    <div aria-hidden="true" className="overflow-hidden border-y hairline bg-[#0A0A0F] py-5 md:py-6">
      <div className="animate-marquee flex w-max hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
