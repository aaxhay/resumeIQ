import type { AnalysisRule, ResumeFinding, SectionKind } from "./contracts.ts";
import { makeFinding, spanAcross, wordCount } from "./evidence.ts";

export const checkContact: AnalysisRule = (context) => {
  // Bound address components and anchor the token start: an unbounded local
  // part would retry quadratically on a long word containing no @ character.
  const email = /(?<![\p{L}\d._%+-])[\p{L}\d._%+-]{1,64}@[\p{L}\d.-]{1,253}\.[\p{L}]{2,63}(?![\p{L}\d.-])/u.test(context.text);
  const phone = [...context.text.matchAll(/(?:\+?\d[\d ().-]{6,}\d)/gu)].some(([value]) => {
    const digits = value.replace(/\D/gu, "").length;
    return digits >= 10 && digits <= 15;
  });
  const profile = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s]+/iu.test(context.text);
  if (email || phone || profile) return [];
  return [makeFinding(context, {
    rule_id: "structure.contact-not-detected", category: "structure", severity: "info", kind: "suggestion", confidence: "low",
    title: "Contact details were not detected",
    description: "No recognizable email, 10–15 digit phone pattern, or LinkedIn profile URL was found. Other contact formats may not be recognized, and extraction may have omitted a header.",
    recommendation: "Check the original and ensure an appropriate contact method is visible. Do not add private details you do not want to share.",
  })];
};

export const checkHeadings: AnalysisRule = (context) => context.sections.length ? [] : [makeFinding(context, {
  rule_id: "structure.headings-not-detected", category: "structure", severity: "info", kind: "suggestion", confidence: "low",
  title: "Section headings were not recognized",
  description: "No supported standalone English section labels were recognized. This does not prove that sections are missing; custom labels, another language, or extraction layout may explain it.",
  recommendation: "Check that relevant experience, education, and skills are easy to locate. Consider recognizable labels only if they fit your resume.",
})];

export const checkCoreSections: AnalysisRule = (context) => {
  // A single heading-recognition finding is more useful than several absence claims when parsing found no sections.
  if (!context.sections.length) return [];
  const required: SectionKind[] = ["experience", "education", "skills"];
  if (context.options.projectsRelevant) required.push("projects");
  return required.filter((kind) => !context.sections.some((section) => section.kinds.includes(kind))).map((kind) => makeFinding(context, {
    rule_id: `structure.${kind}-not-detected`, category: "structure", severity: "info", kind: "suggestion", confidence: "low",
    title: `${kind[0]?.toUpperCase()}${kind.slice(1)} heading was not detected`,
    description: `A recognized standalone ${kind} heading was not found. Content may be present under another label or affected by extraction.${kind === "projects" ? " This check ran because project relevance was explicitly enabled." : ""}`,
    recommendation: `If ${kind} is relevant to this resume, make the existing information easy to locate. Do not invent or add irrelevant content merely to satisfy this check.`,
  }));
};

export const checkSectionContent: AnalysisRule = (context) => {
  const findings: ResumeFinding[] = [];
  for (const section of context.sections) {
    const content = section.lines.filter((line) => /[\p{L}\p{N}]/u.test(line.text));
    if (content.length === 0) {
      findings.push(makeFinding(context, {
        rule_id: "structure.empty-section", category: "structure", severity: "warning", kind: "objective", confidence: "high",
        title: "Recognized section has no readable content",
        description: "No letters or numbers appear after this recognized heading before the next recognized heading or end of text. This is an observation about extracted text, not proof of missing experience.",
        recommendation: "Compare with the original. Restore omitted content, or remove the heading if the section is intentionally unused.",
      }, section.heading));
    } else if (section.kinds.some((kind) => ["experience", "education", "projects", "summary"].includes(kind))) {
      const words = wordCount(content.map((line) => line.text).join(" "));
      if (words < 5) findings.push(makeFinding(context, {
        rule_id: "structure.short-section", category: "structure", severity: "info", kind: "suggestion", confidence: "low",
        title: "Section contains very little text",
        description: `Only ${words} word(s) were detected in this section. Fewer than 5 is this rule's review trigger, not a required resume length. Concise entries can be appropriate.`,
        recommendation: "Check for extraction loss and whether the section conveys enough truthful context. Keep it brief if no additional detail is needed.",
      }, spanAcross(section.heading, content.at(-1) ?? section.heading)));
    }
  }
  return findings;
};

// Only month/year dates participate. A year-only education date alongside an
// employment month/year is not treated as an inconsistent date format.
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATES = new RegExp(`\\b(?:${MONTH}\\.? +(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])/(?:19|20)\\d{2}|(?:19|20)\\d{2}-(?:0[1-9]|1[0-2]))\\b`, "giu");

export const checkDateFormats: AnalysisRule = (context) => {
  const findings: ResumeFinding[] = [];
  // Compare like sections independently, not dates in contact details or links.
  for (const section of context.sections.filter((entry) => entry.kinds.some((kind) => kind === "experience" || kind === "education" || kind === "projects"))) {
    const dates = section.lines.flatMap((line) => [...line.text.matchAll(DATES)].map((match) => ({ line, value: match[0], index: match.index })));
    const styles = new Set(dates.map(({ value }) => /\//u.test(value) ? "numeric-month" : /^\d/u.test(value) ? "year-month" : "named-month"));
    if (styles.size < 2) continue;
    const first = dates[0]; const last = dates.at(-1);
    if (!first || !last) continue;
    findings.push(makeFinding(context, {
      rule_id: "structure.mixed-date-formats", category: "structure", severity: "info", kind: "suggestion", confidence: "medium",
      title: "Month/year dates use different formats",
      description: "This section contains more than one month/year notation (named month, MM/YYYY, or YYYY-MM). Abbreviated and full month names are treated alike. The formats may be intentional.",
      recommendation: "Consider consistent month/year notation within comparable entries. Verify the original text; do not change the actual dates or infer missing months.",
    }, { start: first.line.start + first.index, end: last.line.start + last.index + last.value.length, startLine: first.line.number, endLine: last.line.number }));
  }
  return findings;
};

export const STRUCTURE_RULES: AnalysisRule[] = [checkContact, checkHeadings, checkCoreSections, checkSectionContent, checkDateFormats];
