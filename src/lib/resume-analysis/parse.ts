import type { AnalysisContext, AnalysisOptions, Section, SectionKind, TextBlock, TextLine } from "./contracts.ts";
import { spanAcross } from "./evidence.ts";

const ALIASES: Record<string, SectionKind> = {
  experience: "experience", "work experience": "experience", "professional experience": "experience", "employment history": "experience", "work history": "experience", employment: "experience", "relevant experience": "experience",
  education: "education", "academic background": "education", qualifications: "education", "academic qualifications": "education",
  skills: "skills", "technical skills": "skills", "core skills": "skills", "core competencies": "skills", competencies: "skills", technologies: "skills",
  projects: "projects", "selected projects": "projects", "personal projects": "projects", "academic projects": "projects", "research projects": "projects",
  summary: "summary", profile: "summary", "professional summary": "summary", "career summary": "summary", objective: "summary", "about me": "summary",
  certifications: "other", certificates: "other", awards: "other", publications: "other", languages: "other", interests: "other", volunteering: "other", "volunteer experience": "other", references: "other", "contact information": "other", contact: "other",
};

export function headingKinds(text: string): SectionKind[] | undefined {
  const normalized = text.trim().replace(/^#{1,6}\s+|^\d+[.)]\s+/u, "").replace(/:$/u, "").trim().toLowerCase().replace(/\s+/gu, " ");
  const direct = ALIASES[normalized];
  if (direct) return [direct];
  const parts = normalized.split(/\s*(?:&|\/|\band\b)\s*/u);
  if (parts.length < 2) return;
  const kinds = parts.map((part) => ALIASES[part]);
  if (kinds.some((kind) => !kind)) return;
  return [...new Set(kinds.filter((kind): kind is SectionKind => Boolean(kind)))];
}

const BULLET = /^\s*([-*•●▪◦‣–]|\d+[.)])\s+/u;

/** Conservative text-only parsing; no inference of visual columns or original page layout. */
export function parseResume(text: string, options: AnalysisOptions = {}): AnalysisContext {
  let offset = 0;
  const lines: TextLine[] = text.split("\n").map((value, index) => {
    const line = { text: value, number: index + 1, start: offset, end: offset + value.length, startLine: index + 1, endLine: index + 1 };
    offset += value.length + 1;
    return line;
  });
  const sections: Section[] = [];
  const bullets: TextBlock[] = [];
  const paragraphs: TextBlock[] = [];
  let section: Section | undefined;
  let bullet: TextBlock | undefined;
  let paragraph: TextBlock | undefined;
  for (const line of lines) {
    const kinds = headingKinds(line.text);
    if (kinds) {
      section = { kinds, heading: line, lines: [] };
      sections.push(section);
      bullet = undefined; paragraph = undefined;
      continue;
    }
    section?.lines.push(line);
    if (!line.text.trim()) { bullet = undefined; paragraph = undefined; continue; }
    const marker = BULLET.exec(line.text)?.[1];
    if (marker) {
      bullet = { ...line, section: section?.kinds[0], marker };
      bullets.push(bullet);
      paragraph = undefined;
    } else if (bullet && /^\s{2,}\S/u.test(line.text)) {
      // Only explicit indentation is treated as a wrapped bullet continuation.
      Object.assign(bullet, spanAcross(bullet, line));
      bullet.text = text.slice(bullet.start, bullet.end);
    } else {
      bullet = undefined;
      if (paragraph) {
        Object.assign(paragraph, spanAcross(paragraph, line));
        paragraph.text = text.slice(paragraph.start, paragraph.end);
      } else {
        paragraph = { ...line, section: section?.kinds[0] };
        paragraphs.push(paragraph);
      }
    }
  }
  return { text, lines, sections, bullets, paragraphs, options };
}

export function bulletContent(bullet: TextBlock): string {
  return bullet.text.replace(BULLET, "").trim();
}
