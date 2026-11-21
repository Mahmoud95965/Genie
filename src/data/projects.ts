export type ProjectStatus = "Live" | "In development" | "Concept / Experiment";

export interface Project {
  slug: string;
  name: string;
  short: string;
  category: string;
  status: ProjectStatus;
  /** Accent used for this project's visual identity. */
  accent: "blue" | "violet" | "cyan";
  stack: string[];
  links: { label: string; href: string }[];
  challenge: string;
  concept: string;
  design: string;
  development: string;
  /** Honest note shown on the detail page when a project is not finished. */
  note?: string;
}

/**
 * Real projects only. No invented statistics, clients, awards or results.
 * If a fact is not known, it is not stated here.
 */
export const projects: Project[] = [
  {
    slug: "port-said-hub",
    name: "Port Said Hub",
    short:
      "A digital platform connecting people with services, places, experiences, and opportunities in Port Said.",
    category: "Web Platform · City Platform",
    status: "Live",
    accent: "blue",
    stack: ["Next.js", "TypeScript", "Supabase", "MapLibre"],
    links: [
      { label: "Visit the live site", href: "https://www.port-said-hub.site/" },
      { label: "GitHub — Mahmoud95965/PortSaid", href: "https://github.com/Mahmoud95965/PortSaid" },
    ],
    challenge:
      "Port Said's services, places and opportunities were scattered — hard to discover in one place, in one language, with information people could trust. The city needed a single, reliable starting point, not another directory that goes stale.",
    concept:
      "One hub for the city: an official places directory with an interactive map, a city AI assistant that answers questions about Port Said, and an admin dashboard so the information stays maintained. Built as a platform that can grow with the city, not a one-off site.",
    design:
      "Arabic-first, RTL, built around the map as the primary way to explore. Clear categories — transport, restaurants, housing, points and rewards — with a calm blue and deep-navy identity that reads as a civic utility, not a marketing page.",
    development:
      "Next.js (App Router) with TypeScript, Supabase for database and auth, and MapLibre GL for the interactive map. Includes a PWA manifest, QR support, and an admin area with registration, login and password change. Hosted on Vercel.",
  },
  {
    slug: "qena-services",
    name: "Qena Services Platform",
    short:
      "A digital initiative to organise and connect local services within Qena — connecting residents with vetted local technicians.",
    category: "Web Platform · Services Marketplace",
    status: "In development",
    accent: "violet",
    stack: ["React", "Vite PWA", "Supabase"],
    links: [
      { label: "GitHub — Mahmoud95965/qena-services", href: "https://github.com/Mahmoud95965/qena-services" },
    ],
    challenge:
      "Finding a trustworthy technician in Qena meant asking around and hoping. There was no organised, vetted way for residents to find local services — and no fair way for good technicians to be found.",
    concept:
      "A marketplace that connects Qena residents with vetted local technicians, organised by service and area, with the trust layer built in from the start rather than added later.",
    design:
      "Arabic-first and RTL, designed as a mobile-first PWA so it works like an app on the phones people actually use. Simple, direct flows: find a service, find a technician, get it done.",
    development:
      "React with Vite as a PWA, Supabase with Row Level Security for data and access control. The platform is in development — features and coverage are still being shaped.",
    note: "In development — what is shown here is the direction and the work so far, not a finished product.",
  },
  {
    slug: "genie-experiments",
    name: "Genie Experiments",
    short:
      "Experimental tools, concepts, and digital experiences developed under the Genie identity.",
    category: "Experiments",
    status: "Concept / Experiment",
    accent: "cyan",
    stack: ["Web", "AI", "Interactive"],
    links: [],
    challenge:
      "Good products rarely start as a finished plan. They start as a question worth testing — a small tool, a strange interaction, an idea that might not work.",
    concept:
      "A space inside Genie for that testing: small experimental tools, concepts and digital experiences, built quickly, tried honestly, and kept only if they earn their place. Some become products. Some stay experiments. Both outcomes are useful.",
    design:
      "Each experiment gets its own visual identity and its own rules. The point is not consistency — it is curiosity, kept to a high standard of craft.",
    development:
      "Built with the same stack discipline as client work — modern web tooling, accessible by default — but with room to try approaches that would be too risky in a production platform.",
    note: "Concept / experiment — nothing here is presented as a finished product or a result.",
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectSlugs(): string[] {
  return projects.map((p) => p.slug);
}
