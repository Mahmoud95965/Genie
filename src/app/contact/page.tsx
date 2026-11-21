import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import Reveal from "@/components/Reveal";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Let's create something meaningful. Tell Genie about your idea — project type, description and budget.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 md:px-10 md:pt-40 md:pb-36">
      <div className="grid gap-14 md:grid-cols-12 md:gap-10">
        <div className="md:col-span-5">
          <Reveal>
            <p className="text-xs uppercase tracking-[0.28em] text-sky">Contact</p>
            <h1 className="display mt-4 font-display text-5xl font-bold leading-[1.02] text-white md:text-6xl">
              Let&rsquo;s create something meaningful.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
              Tell us about the idea — what it is, who it&rsquo;s for, and
              what &ldquo;real&rdquo; would look like. We read every message
              ourselves.
            </p>
            {siteConfig.contactEmail ? (
              <p className="mt-8 text-sm text-zinc-400">
                Or email us directly:{" "}
                <a href={`mailto:${siteConfig.contactEmail}`} className="font-medium text-white underline decoration-sky underline-offset-4">
                  {siteConfig.contactEmail}
                </a>
              </p>
            ) : (
              <p className="mt-8 rounded-xl border hairline bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-zinc-500">
                Direct contact details are being set up — use the form for now.
                (Configured in <code className="text-zinc-300">src/config/site.ts</code>.)
              </p>
            )}
          </Reveal>
        </div>
        <div className="md:col-span-7">
          <Reveal delay={0.1}>
            <ContactForm />
          </Reveal>
        </div>
      </div>
    </div>
  );
}
