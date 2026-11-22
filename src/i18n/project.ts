import type { Project, ProjectStatus } from "@/data/projects";
import type { Locale } from "./config";
import type { Messages } from "./messages/en";

export interface LocalizedProject {
  slug: string;
  name: string;
  short: string;
  category: string;
  status: string;
  accent: Project["accent"];
  stack: string[];
  links: { label: string; href: string }[];
  challenge: string;
  concept: string;
  design: string;
  development: string;
  note?: string;
}

export function statusLabel(status: ProjectStatus, t: Messages["project"]): string {
  if (status === "Live") return t.statuses.live;
  if (status === "In development") return t.statuses.inDevelopment;
  return t.statuses.concept;
}

export function localizeProject(project: Project, locale: Locale, t: Messages["project"]): LocalizedProject {
  if (locale === "en") {
    return {
      ...project,
      status: statusLabel(project.status, t),
      links: project.links.map((l) => ({ label: l.label, href: l.href })),
    };
  }
  return {
    slug: project.slug,
    name: project.name,
    short: project.shortAr,
    category: project.categoryAr,
    status: statusLabel(project.status, t),
    accent: project.accent,
    stack: project.stack,
    links: project.links.map((l) => ({ label: l.labelAr ?? l.label, href: l.href })),
    challenge: project.challengeAr,
    concept: project.conceptAr,
    design: project.designAr,
    development: project.developmentAr,
    note: project.noteAr,
  };
}
