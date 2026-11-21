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

| Route | Page |
| --- | --- |
| `/` | Home — hero with generative canvas artwork, selected work, capabilities, approach, philosophy, closing CTA |
| `/work` | Portfolio — all projects |
| `/work/[slug]` | Project case study — Challenge, Concept, Design direction, Development |
| `/about` | Vision, philosophy, beliefs, how we work, ambitions |
| `/contact` | Contact form (interface only — see below) |

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
    work/[slug]/  # project case studies (static params)
  components/     # Navbar, Footer, HeroVisual, ProjectCover,
                  # Capabilities, ContactForm, Reveal
  config/site.ts  # site-wide settings + TODOs (domain, email, socials)
  data/projects.ts# real project data only
public/
  favicon.svg  og-image.svg
docs/
  contact-form.md # backend integration requirements
```
