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
    shortAr:
      "مبادرة رقمية لتنظيم وربط الخدمات المحلية داخل قنا — تربط السكان بفنيين محليين موثوقين.",
    categoryAr: "منصة ويب · سوق خدمات",
    challengeAr:
      "كان العثور على فني موثوق في قنا يعني أن تسأل من حولك وأن تأمل. لم تكن هناك طريقة منظمة وموثوقة ليجد السكان الخدمات المحلية — ولا طريقة عادلة ليجد الفنيون الجيدون عملاً.",
    conceptAr:
      "سوق يربط سكان قنا بفنيين محليين موثوقين، منظّم حسب الخدمة والمنطقة، مع طبقة الثقة مبنية فيه منذ البداية لا مضافة لاحقاً.",
    designAr:
      "العربية أولاً ومن اليمين إلى اليسار، ومصمم كتطبيق ويب تقدمي (PWA) يعمل كتطبيق على الهواتف التي يستخدمها الناس فعلاً. تدفقات بسيطة ومباشرة: ابحث عن خدمة، وابحث عن فني، وأنجز العمل.",
    developmentAr:
      "React مع Vite كتطبيق ويب تقدمي، وSupabase مع أمان مستوى الصفوف (Row Level Security) للبيانات والتحكم في الوصول. المنصة قيد التطوير — الميزات والتغطية ما زالت تتشكل.",
    noteAr: "قيد التطوير — ما يظهر هنا هو الاتجاه والعمل حتى الآن، وليس منتجاً مكتملاً.",
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
    shortAr:
      "أدوات ومفاهيم وتجارب رقمية تجريبية تُطوَّر تحت هوية Genie.",
    categoryAr: "تجارب",
    challengeAr:
      "نادراً ما تبدأ المنتجات الجيدة كخطة مكتملة. تبدأ كسؤال يستحق الاختبار — أداة صغيرة، أو تفاعل غريب، أو فكرة قد لا تنجح.",
    conceptAr:
      "مساحة داخل Genie لهذا الاختبار: أدوات تجريبية صغيرة ومفاهيم وتجارب رقمية، تُبنى بسرعة وتُجرَّب بصدق، ويُحتفظ فقط بما يثبت جدارته. بعضها يصبح منتجات. وبعضها يبقى تجارب. وكلتا النتيجتين مفيدتان.",
    designAr:
      "لكل تجربة هويتها البصرية وقواعدها الخاصة. الهدف ليس الاتساق — بل الفضول، بمعايير عالية من الحرفية.",
    developmentAr:
      "تُبنى بنفس انضباط التقنيات المستخدمة في أعمال العملاء — أدوات ويب حديثة، وسهولة وصول افتراضية — مع مساحة لتجربة أساليب قد تكون محفوفة بالمخاطر في منصة إنتاجية.",
    noteAr: "مفهوم / تجربة — لا يُعرض هنا أي شيء على أنه منتج مكتمل أو نتيجة.",
  },
  {
    slug: "genie-model",
    name: "Genie Model",
    short:
      "An AI model by Genie, free to try with a daily limit. Ask it about Genie, our ventures, or anything else.",
    category: "AI Model",
    status: "Live",
    accent: "violet",
    stack: ["Next.js", "AI"],
    links: [],
    challenge:
      "Good AI assistance was often expensive or locked behind accounts. Genie wanted a model anyone could try for free — no account, no setup, just ask.",
    concept:
      "Genie Model is an AI model by Genie that anyone can chat with for free, with a daily limit. It answers questions, explains ideas, and helps people explore what Genie does — in Arabic or English.",
    design:
      "A simple chat page in the Genie design system — dark, calm, bilingual. No account needed.",
    development:
      "A chat page on the Genie website, with a free daily limit and a bring-your-own-key option. Built to be simple: no account, no setup — just ask.",
    shortAr:
      "نموذج ذكاء اصطناعي من Genie، جرّبه مجاناً بحد يومي. اسأله عن Genie أو مشاريعنا أو أي شيء آخر.",
    categoryAr: "نموذج ذكاء اصطناعي",
    challengeAr:
      "كانت المساعدة الذكية الجيدة غالباً مكلفة أو مقفلة خلف حسابات. أرادت Genie نموذجاً يمكن لأي شخص تجربته مجاناً — لا حساب ولا إعداد، فقط اسأل.",
    conceptAr:
      "نموذج Genie هو نموذج ذكاء اصطناعي من Genie يمكن لأي شخص التحدث معه مجاناً بحد يومي. يجيب عن الأسئلة، ويشرح الأفكار، ويساعد الناس على استكشاف ما تفعله Genie — بالعربية أو بالإنجليزية.",
    designAr:
      "صفحة دردشة بسيطة بنظام تصميم Genie — داكنة وهادئة وثنائية اللغة. لا حاجة لحساب.",
    developmentAr:
      "صفحة دردشة على موقع Genie، بحد يومي مجاني وخيار استخدام مفتاحك الخاص. بُنيت لتكون بسيطة: لا حساب ولا إعداد — فقط اسأل.",
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getProjectSlugs(): string[] {
  return projects.map((p) => p.slug);
}
