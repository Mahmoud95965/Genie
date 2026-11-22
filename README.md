# Genie — Official Website

Genie is a digital product studio. This is its official website:
**“Make Ideas Real.” — Ideas deserve to become real.**

Dark-first, editorial, custom-built. Genie is the new independent
identity — no old branding is used anywhere on this site.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Framer Motion (scroll reveals, menu, hero)
- Lucide icons
- No backend, no database, no paid services

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (must pass before deploy)
npm run start    # serve the production build
```

Requires Node 18+ (tested on Node 24 / npm 10).

## Pages

All content lives under a locale prefix — `/en` and `/ar`. `/` redirects
to `/en`. Legacy non-locale URLs (`/work`, `/about`, `/contact`,
`/work/[slug]`) redirect to their English versions.

| Route | Page |
| --- | --- |
| `/{locale}` | Home — hero with generative canvas artwork and the Genie logo, selected work, capabilities, approach, philosophy, closing CTA |
| `/{locale}/work` | Portfolio — all projects |
| `/{locale}/work/[slug]` | Project case study — Challenge, Concept, Design direction, Development |
| `/{locale}/about` | Vision, philosophy, beliefs, how we work, ambitions |
| `/{locale}/contact` | Contact form (interface only — see below) |

## Languages (EN / AR)

- Routes are `app/[locale]` with locales `en` and `ar`; the locale is
  carried by the URL, not cookies.
- Dictionaries live in `src/i18n/messages/` (`en.ts` is the source,
  `ar.ts` must satisfy the same type). Arabic is professional, natural
  Arabic; brand name "Genie", project names and tech terms stay Latin.
- Arabic pages render `<html lang="ar" dir="rtl">` with the IBM Plex
  Sans Arabic font (via `next/font/google`); English keeps Inter +
  Space Grotesk. Letter-spacing is disabled for Arabic script (it
  breaks letter joining), and directional arrows flip in RTL.
- The Navbar (desktop + mobile menu) has a language switcher linking
  to the same page in the other locale.
- SEO is per locale: unique title/description, `hreflang` alternates,
  and `sitemap.xml` lists both locale versions of every page.

## Logo

The real Genie logo — the stylised G with the smoke swirl, violet →
blue → cyan/teal on dark navy — lives at `public/logo/genie-logo.jpg`
(copied as-is from the file Mahmoud supplied; never altered, recoloured
or redrawn). It is used in the Navbar, Footer, home hero eyebrow,
favicon (`/logo/genie-logo.jpg` via metadata icons, plus a real
`public/favicon.ico` generated from it) and the Open Graph image.
The site is dark-first, so the logo's dark background blends in; it
never appears on a light background.

Projects are real, in `src/data/projects.ts`:

- **Port Said Hub** — Live. https://www.port-said-hub.site/ · GitHub `Mahmoud95965/PortSaid`
- **Qena Services Platform** — In development. GitHub `Mahmoud95965/qena-services`
- **Genie Experiments** — Concept / Experiment. No links, no invented results.

No fake stats, testimonials, awards, clients, employees, offices,
or company history anywhere on the site.

## Configure before launch

Everything configurable lives in **`src/config/site.ts`**:

- `siteUrl` — TODO: set the real production domain (currently the
  placeholder `https://genie.example`). Used for canonical URLs,
  Open Graph, the sitemap, and JSON-LD.
- `contactEmail` — TODO: add the real contact email when one exists.
  The contact page and footer show it only when set.
- `socials` — TODO: add real profiles only when they exist. Empty
  values are hidden, never shown as dead links.

Do not invent a domain, email, phone number, or social handle to
fill these in.

## Contact form

The form (`src/components/ContactForm.tsx`) has client-side validation
and clear success/error states, but **no backend is connected**.
On valid submit it says so honestly instead of faking a
“message sent” confirmation.

To make submissions actually send, follow
**[`docs/contact-form.md`](docs/contact-form.md)**.

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it in Vercel (Framework preset: Next.js).
3. No environment variables are required.
4. Set the production domain in Vercel, then update `siteUrl` in
   `src/config/site.ts` to match and redeploy.

## SEO & accessibility

- Unique title/description per page, Open Graph + Twitter Card,
  `robots.txt` and `sitemap.xml` (generated from `src/app/robots.ts`
  and `src/app/sitemap.ts`), JSON-LD Organization (name only until a
  real domain is configured).
- Semantic HTML, skip-to-content link, visible focus states,
  `aria` labels on interactive elements, `prefers-reduced-motion`
  respected (hero canvas renders a single static frame, reveals
  are disabled).

## Project structure

```
src/
  app/            # App Router pages + layout + robots/sitemap
    [locale]/     # en + ar: home, work, work/[slug], about, contact
  components/     # Navbar, Footer, HeroVisual, ProjectCover,
                  # Capabilities, ContactForm, Reveal
  config/site.ts  # site-wide settings + TODOs (domain, email, socials)
  data/projects.ts# real project data only (EN + AR copy)
  i18n/           # locales, dictionaries, project localisation
public/
  logo/genie-logo.jpg  # the real Genie logo (do not alter)
  favicon.ico          # generated from the logo
docs/
  contact-form.md # backend integration requirements
```
