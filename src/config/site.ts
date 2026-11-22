/**
 * GENIE — single source of truth for site-wide settings.
 *
 * TODO (before launch): fill in the real values below.
 * Nothing here should be presented as a real contact channel until
 * Mahmoud confirms it. Do NOT invent an email, phone number or
 * social handle — leave the TODOs until the real ones exist.
 */
export const siteConfig = {
  name: "Genie",
  tagline: "Make Ideas Real.",
  description:
    "Genie is an independent digital technology company building products, platforms, and intelligent digital experiences. We turn ideas into meaningful solutions through technology, design, and innovation — creating products that solve real problems and open new possibilities.",

  // TODO: set the real production domain, e.g. "https://genie.studio".
  // Used for canonical URLs, Open Graph and the sitemap.
  // Until it is set, keep the placeholder — do not publish a made-up domain.
  siteUrl: "https://genie.example",

  // TODO: add the real contact email when one exists.
  // The contact form does NOT send email yet — see docs/contact-form.md.
  contactEmail: "", // e.g. "hello@genie.studio" — TODO

  // TODO: add real social profiles only when they exist.
  // Leave empty arrays / empty strings until then; the footer and
  // contact page hide social links when none are configured.
  socials: {
    github: "", // e.g. "https://github.com/Mahmoud95965" — TODO
    linkedin: "", // TODO
    x: "", // TODO
    instagram: "", // TODO
  },
} as const;

export type SiteConfig = typeof siteConfig;
