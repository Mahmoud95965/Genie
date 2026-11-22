import type { LocalizedProject } from "@/i18n/project";
import type { Locale } from "@/i18n/config";

/**
 * Cover visual for a project — pure CSS/SVG composition, no stock photos.
 * Each project gets its own visual identity through accent + motif.
 * Labels come from the localized project (status/category in the page locale).
 */
export default function ProjectCover({
  project,
  locale,
  large = false,
}: {
  project: LocalizedProject;
  locale: Locale;
  large?: boolean;
}) {
  const palette =
    project.accent === "blue"
      ? { from: "from-[#0B2A6B]", via: "via-[#0A0A0F]", glow: "bg-blue-600/30", ring: "border-blue-500/30", text: "text-sky" }
      : project.accent === "violet"
        ? { from: "from-[#2E1065]", via: "via-[#0A0A0F]", glow: "bg-violet-600/30", ring: "border-violet-500/30", text: "text-violet-300" }
        : { from: "from-[#0B3B4D]", via: "via-[#0A0A0F]", glow: "bg-cyan-500/25", ring: "border-cyan-400/30", text: "text-cyan-300" };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border hairline bg-gradient-to-br ${palette.from} ${palette.via} to-[#050507] ${
        large ? "aspect-[16/9]" : "aspect-[4/3]"
      }`}
      role="img"
      aria-label={
        locale === "ar" ? `الهوية البصرية لمشروع ${project.name}` : `Visual identity for ${project.name}`
      }
    >
      {/* glow */}
      <div className={`absolute -right-16 -top-16 h-64 w-64 rounded-full ${palette.glow} blur-3xl`} aria-hidden="true" />
      <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/5 blur-3xl" aria-hidden="true" />
      {/* grid */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* motif per project */}
      {project.slug === "port-said-hub" && (
        <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx="200" cy="120" r="52" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity="0.8" />
          <circle cx="200" cy="120" r="86" fill="none" stroke="#2563EB" strokeWidth="1" opacity="0.5" />
          <path d="M200 34v40M200 166v40M114 120h40M246 120h40" stroke="#38BDF8" strokeWidth="1" opacity="0.5" />
          <circle cx="200" cy="120" r="6" fill="#38BDF8" />
          <circle cx="286" cy="120" r="4" fill="#60A5FA" />
          <circle cx="200" cy="34" r="4" fill="#60A5FA" />
        </svg>
      )}
      {project.slug === "qena-services" && (
        <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={90 + i * 90} y={70 + i * 18} width="64" height="64" rx="14" fill="none" stroke="#8B5CF6" strokeWidth="1.5" opacity={0.9 - i * 0.2} />
              <circle cx={122 + i * 90} cy={102 + i * 18} r="5" fill="#A78BFA" />
            </g>
          ))}
          <path d="M154 102 L180 120 M244 120 L270 138" stroke="#8B5CF6" strokeWidth="1" opacity="0.6" />
        </svg>
      )}
      {project.slug === "genie-experiments" && (
        <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path d="M60 180 L140 70 L200 150 L270 50 L340 170" fill="none" stroke="#22D3EE" strokeWidth="1.5" opacity="0.8" />
          <circle cx="140" cy="70" r="5" fill="#22D3EE" />
          <circle cx="270" cy="50" r="5" fill="#22D3EE" />
          <circle cx="200" cy="150" r="4" fill="#67E8F9" />
        </svg>
      )}
      {project.slug === "genie-model" && (
        <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path d="M70 170 L150 80 L230 160 L310 60" fill="none" stroke="#A78BFA" strokeWidth="1.5" opacity="0.8" />
          <circle cx="70" cy="170" r="6" fill="#A78BFA" />
          <circle cx="150" cy="80" r="6" fill="#C4B5FD" />
          <circle cx="230" cy="160" r="5" fill="#A78BFA" />
          <circle cx="310" cy="60" r="6" fill="#C4B5FD" />
          <circle cx="200" cy="120" r="3" fill="#8B5CF6" />
        </svg>
      )}
      {project.slug === "storyworld" && (
        <svg viewBox="0 0 400 240" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <path d="M200 40 V200" stroke="#22D3EE" strokeWidth="1" opacity="0.5" />
          {[56, 120, 184].map((y, i) => (
            <g key={y}>
              <rect x={140} y={y - 16} width={120} height={32} rx={8} fill="none" stroke="#22D3EE" strokeWidth="1.5" opacity={0.9 - i * 0.2} />
              <circle cx={200} cy={y} r={5} fill="#67E8F9" />
            </g>
          ))}
        </svg>
      )}
      {/* label */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 md:bottom-6 md:left-6">
        <span className={`rounded-full border ${palette.ring} bg-black/40 px-3 py-1 text-[11px] uppercase tracking-[0.16em] backdrop-blur ${palette.text}`}>
          {project.category}
        </span>
        <span className="rounded-full border hairline bg-black/40 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300 backdrop-blur">
          {project.status}
        </span>
      </div>
      <span className="absolute right-5 top-4 font-display text-5xl font-bold text-white/10 md:text-6xl" aria-hidden="true">
        {project.slug === "port-said-hub" ? "01" : project.slug === "qena-services" ? "02" : project.slug === "genie-experiments" ? "03" : project.slug === "genie-model" ? "04" : "05"}
      </span>
    </div>
  );
}
