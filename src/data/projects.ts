export type ProjectStatus = "Live" | "In development" | "Concept / Experiment";

export interface Project {
  slug: string;
  name: string;
  short: string;
  category: string;
  status: ProjectStatus;
  /** Accent used for this project's visual identity. */
  accent: "blue" | "violet" | "cyan";
  /** Real cover image (public path) supplied for the project, shown on its card. */
  coverImage?: string;
  stack: string[];
  links: { label: string; labelAr?: string; href: string }[];
  challenge: string;
  concept: string;
  design: string;
  development: string;
  /** Honest note shown on the detail page when a project is not finished. */
  note?: string;
  /** Arabic translations of the copy above (names, stack and URLs stay Latin). */
  shortAr: string;
  categoryAr: string;
  challengeAr: string;
  conceptAr: string;
  designAr: string;
  developmentAr: string;
  noteAr?: string;
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
    coverImage: "/projects/port-said-hub-cover.jpg",
    stack: ["Next.js", "TypeScript", "Supabase", "MapLibre"],
    links: [
      { label: "Visit the live site", labelAr: "زيارة الموقع الحي", href: "https://www.port-said-hub.site/" },
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
    shortAr:
      "منصة رقمية تربط الناس بالخدمات والأماكن والتجارب والفرص في بورسعيد.",
    categoryAr: "منصة ويب · منصة مدن",
    challengeAr:
      "كانت خدمات بورسعيد وأماكنها وفرصها متناثرة — يصعب اكتشافها في مكان واحد، بلغة واحدة، بمعلومات يمكن الوثوق بها. كانت المدينة بحاجة إلى نقطة بداية واحدة موثوقة، لا إلى دليل آخر يتقادم.",
    conceptAr:
      "مركز واحد للمدينة: دليل رسمي للأماكن مع خريطة تفاعلية، ومساعد ذكاء اصطناعي للمدينة يجيب عن الأسئلة حول بورسعيد، ولوحة تحكم للإدارة حتى تظل المعلومات محدّثة. بُني كمنصة يمكن أن تكبر مع المدينة، لا كموقع لمرة واحدة.",
    designAr:
      "العربية أولاً، ومن اليمين إلى اليسار، والخريطة هي الطريقة الأساسية للاستكشاف. فئات واضحة — المواصلات والمطاعم والسكن والنقاط والمكافآت — بهوية زرقاء هادئة وكحلية عميقة تُقرأ كخدمة مدنية، لا كصفحة تسويقية.",
    developmentAr:
      "Next.js (App Router) مع TypeScript، وSupabase لقاعدة البيانات والمصادقة، وMapLibre GL للخريطة التفاعلية. يشمل بيان PWA ودعم QR ومنطقة إدارة فيها التسجيل وتسجيل الدخول وتغيير كلمة المرور. مستضاف على Vercel.",
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectSlugs(): string[] {
  return projects.map((p) => p.slug);
}
