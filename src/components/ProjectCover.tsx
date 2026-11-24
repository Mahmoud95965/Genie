import Image from "next/image";
import type { LocalizedProject } from "@/i18n/project";
import type { Locale } from "@/i18n/config";

/**
 * Cover visual for a project.
 * When a project has a real supplied cover image, it is shown whole
 * (object-contain on the artwork's own cream background, so nothing is
 * cropped). Otherwise the pure CSS/SVG composition is used — no stock photos.
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
      className={`relative overflow-hidden rounded-2xl border hairline ${
        project.coverImage
          ? "bg-[#F2EDE7]"
          : `bg-gradient-to-br ${palette.from} ${palette.via} to-[#050507]`
      } ${large ? "aspect-[16/9]" : "aspect-[4/3]"}`}
      role="img"
      aria-label={
        locale === "ar" ? `الهوية البصرية لمشروع ${project.name}` : `Visual identity for ${project.name}`
      }
    >
      {project.coverImage ? (
        <Image
          src={project.coverImage}
          alt={locale === "ar" ? `غلاف مشروع ${project.name}` : `Cover image for ${project.name}`}
          fill
          sizes={large ? "(max-width: 768px) 100vw, 1200px" : "(max-width: 768px) 100vw, 600px"}
          className="object-contain"
          style={{ backgroundColor: "#F2EDE7" }}
        />
      ) : (
        <>
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
        </>
      )}
      {/* venture number — navy translucent on a cover image, white on the dark motif */}
      <span
        className={`absolute right-5 top-4 font-display text-5xl font-bold md:text-6xl ${
          project.coverImage ? "text-[#0B2A5B]/25" : "text-white/10"
        }`}
        aria-hidden="true"
      >
        {project.slug === "port-said-hub" ? "01" : "02"}
      </span>
      {/* label */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 md:bottom-6 md:left-6">
        <span className={`rounded-full border ${palette.ring} bg-black/40 px-3 py-1 text-[11px] uppercase tracking-[0.16em] backdrop-blur ${palette.text}`}>
          {project.category}
        </span>
        <span className="rounded-full border hairline bg-black/40 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-zinc-300 backdrop-blur">
          {project.status}
        </span>
      </div>
    </div>
  );
}
