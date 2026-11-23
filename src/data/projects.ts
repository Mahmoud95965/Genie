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
  {
    slug: "storyworld",
    name: "Story-World Consistency Engine",
    short:
      "An engine that wraps an AI model with an explicit, evolving world state behind a story's chapters — typed events, character facts, knowledge and open promises, each backed by verbatim evidence — so contradictions can be flagged and a human decides the repair.",
    category: "AI Tool · Story Consistency",
    status: "In development",
    accent: "cyan",
    stack: ["Next.js", "TypeScript", "OpenRouter"],
    links: [],
    challenge:
      "Long stories contradict themselves: a character who died acts again, a secret is used by someone who never learned it, a promise is forgotten. Readers notice; writers lose track. Memory inside a model is not a record — it drifts, and nothing can point at the evidence.",
    concept:
      "Keep the story's world as an explicit, append-only ledger: every event, fact and promise is a typed record backed by a verbatim quote with verified offsets, grouped into commits a human reviews and accepts. A deterministic checker flags contradictions against that state, and a writer (in a later milestone) drafts new scenes conditioned on it. The model proposes; only the reviewed commit protocol writes.",
    design:
      "No public demo yet. The engine is being built milestone by milestone, in the open about what each milestone does and does not do — starting with an offline scaffold and a small Arabic dev fixture, before any live model call, review queue, or checker.",
    development:
      "M0 is built: the offline scaffold — OpenRouter client with an allowlist and live-call gating, the extractor contract (prompt extractor.v2 and the GenieExtractorOutput schema), evidence verification over NFC code-point offsets, an in-memory job queue and worker, the starter migration file (not executed), and the dev fixture with a recorded extractor response. M1 (review queue, commit ledger, rule checker) and M2 (writer) are not built yet. No live model calls have been made; no public demo exists.",
    note: "In development — M0 only: offline scaffold, extractor contract, evidence verification and dev fixture. No live model calls yet, no public demo.",
    shortAr:
      "محرك يغلّف نموذج ذكاء اصطناعي بحالة عالم صريحة ومتطورة خلف فصول القصة — أحداث مكتوبة، وحقائق شخصيات، ومعرفة، ووعود مفتوحة، كل منها مدعوم بدليل حرفي — حتى يمكن رصد التناقضات ويقرر الإنسان الإصلاح.",
    categoryAr: "أداة ذكاء اصطناعي · اتساق القصص",
    challengeAr:
      "القصص الطويلة تناقض نفسها: شخصية ماتت تتصرف مجدداً، أو سر يستخدمه من لم يتعلمه أبداً، أو وعد يُنسى. القراء يلاحظون، والكتّاب يفقدون التتبع. الذاكرة داخل النموذج ليست سجلاً — فهي تنحرف، ولا شيء فيها يشير إلى الدليل.",
    conceptAr:
      "الحفاظ على عالم القصة كسجل صريح لا يُعدَّل إلا بالإضافة: كل حدث وحقيقة ووعد سجل مكتوب مدعوم باقتباس حرفي بإزاحات موثقة، مجمّع في التزامات يراجعها الإنسان ويقبلها. وفاحص حتمي يرصد التناقضات مقابل تلك الحالة، وكاتب (في مرحلة لاحقة) يصوغ مشاهد جديدة مشروطة بها. النموذج يقترح، وبروتوكول الالتزام المراجَع وحده هو الذي يكتب.",
    designAr:
      "لا عرض عام بعد. يُبنى المحرك مرحلة بمرحلة، مع وضوح حول ما تفعله كل مرحلة وما لا تفعله — بدءاً بهيكل يعمل دون اتصال وقصة اختبار عربية قصيرة، قبل أي استدعاء حي للنموذج أو قائمة مراجعة أو فاحص.",
    developmentAr:
      "المرحلة M0 مبنية: الهيكل الذي يعمل دون اتصال — عميل OpenRouter بقائمة مسموحات وبوابة للمكالمات الحية، وعقد المستخرج (القالب extractor.v2 ومخطط GenieExtractorOutput)، والتحقق من الأدلة بإزاحات نقاط ترميز NFC، وقائمة مهام ووحدة عامل في الذاكرة، وملف الترحيل الأولي (غير منفَّذ)، وقصة الاختبار مع استجابة مستخرج مسجلة. المرحلتان M1 (قائمة المراجعة وسجل الالتزام والفاحص) وM2 (الكاتب) غير مبنيتين بعد. لم تُجرَ أي مكالمات حية للنموذج بعد، ولا يوجد عرض عام.",
    noteAr: "قيد التطوير — المرحلة M0 فقط: هيكل دون اتصال، وعقد المستخرج، والتحقق من الأدلة، وقصة اختبار. لا مكالمات حية للنموذج بعد، ولا عرض عام.",
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectSlugs(): string[] {
  return projects.map((p) => p.slug);
}
