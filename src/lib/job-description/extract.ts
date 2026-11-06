import { z } from "zod";
import { jobProfileSchema } from "./contracts.ts";
import type { JobEvidence, JobProfile, JobRequirement } from "./contracts.ts";

// Validate without transforming: offsets always refer to the original UTF-16 text.
const inputSchema = z.string().min(50).max(10_000).refine(
  (text) => text.trim().length >= 50,
  "Job description must contain at least 50 characters after trimming.",
);

type Category = JobRequirement["category"];
type Span = { start: number; end: number };
const headings: Readonly<Record<string, Category>> = {
  "required skills": "required_skill",
  "required skill": "required_skill",
  required: "required_skill",
  "must have": "required_skill",
  "minimum requirements": "required_skill",
  "preferred skills": "preferred_skill",
  "preferred skill": "preferred_skill",
  preferred: "preferred_skill",
  "nice to have": "preferred_skill",
  responsibilities: "responsibility",
  "what you'll do": "responsibility",
  experience: "experience",
  "experience requirements": "experience",
  education: "qualification",
  "education requirements": "qualification",
  certifications: "qualification",
  "certification requirements": "qualification",
  qualifications: "qualification",
  "education and certifications": "qualification",
  "education/certifications/qualifications": "qualification",
  "technical requirements": "technical_requirement",
};
const fieldLabels: Readonly<Record<string, "title" | "company">> = {
  "job title": "title", role: "title", position: "title", company: "company", employer: "company",
};
const qualificationCue = /\b(?:degree|diploma|bachelor(?:'s)?|master(?:'s)?|ph\.?d\.?|certification|certified|certificate|education)\b/i;
const experienceCue = /\bexperience\b|\b\d+\+?\s+years?\b/i;
const negativeCue = /\b(?:not required|not necessary|no .{0,60} required|no (?:need|requirement) for|optional|not preferred)\b/i;
const nonRequirementCue = /^(?:we (?:are|offer|provide|build|believe)\b|our\b|(?:the )?(?:company|employer|location|salary|compensation|benefits)\b|you (?:will )?(?:enjoy|receive|benefit)\b)/i;
const excludedLabel = /^(?:about(?: us| the company| the role)?|skills|requirements|overview|summary|benefits|perks|salary|compensation|location|work location|employment type|job type|equal opportunity|how to apply|application process|our (?:team|culture|mission)|who we are)$/i;

function normalizedLabel(value: string): string {
  return value.trim().replace(/[’‘]/g, "'").replace(/[-–]/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function trimSpan(text: string, start: number, end: number): Span {
  const value = text.slice(start, end);
  return { start: start + value.length - value.trimStart().length, end: end - (value.length - value.trimEnd().length) };
}

// Line numbers are one-based; endLine describes the exclusive end offset.
function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r\n|\r|\n/).length;
}

function evidenceFor(text: string, span: Span): JobEvidence {
  return { ...span, text: text.slice(span.start, span.end), startLine: lineAt(text, span.start), endLine: lineAt(text, span.end) };
}

/** Check shape and provenance, not whether arbitrary supplied categories are semantically correct. */
export function validateJobProfile(profile: unknown, text: string): JobProfile {
  inputSchema.parse(text);
  const parsed = jobProfileSchema.parse(profile);
  const checkEvidence = (evidence: JobEvidence) => {
    if (evidence.start >= evidence.end || evidence.end > text.length
      || text.slice(evidence.start, evidence.end) !== evidence.text
      || evidence.startLine !== lineAt(text, evidence.start)
      || evidence.endLine !== lineAt(text, evidence.end)) {
      throw new Error("Job profile evidence does not match the original text and location.");
    }
  };
  for (const field of [parsed.title, parsed.company]) {
    if (!field) continue;
    checkEvidence(field.evidence);
    if (!field.value.trim() || !field.evidence.text.includes(field.value)) {
      throw new Error("Job profile field must occur verbatim within its evidence.");
    }
  }
  const ids = new Set<string>();
  for (const entry of parsed.requirements) {
    checkEvidence(entry.evidence);
    if (!entry.requirement.trim() || entry.requirement !== entry.evidence.text || ids.has(entry.id)) {
      throw new Error("Job requirements must be verbatim evidence with unique IDs.");
    }
    ids.add(entry.id);
  }
  return parsed;
}

function specializedCategory(value: string, category: Category): Category {
  // Preference is never promoted to a mandatory experience/qualification entry.
  if (category !== "required_skill") return category;
  if (qualificationCue.test(value)) return "qualification";
  if (experienceCue.test(value)) return "experience";
  return category;
}

function explicitCategory(value: string): Category | null {
  // Negated/optional wording is not a requirement. Do not treat incidental mentions
  // such as "tools required by our customers" as a candidate requirement.
  if (negativeCue.test(value) || nonRequirementCue.test(value)) return null;
  if (/\b(?:is |are )?preferred[.!]?$/i.test(value)
    || /^(?:(?:we|the company) (?:would )?prefer|preferably)\b/i.test(value)) return "preferred_skill";
  if (/\b(?:is |are )?required[.!]?$/i.test(value)
    || /^(?:(?:you|candidates?|applicants?)\s+)?must have\b/i.test(value)
    || /^(?:we require|you (?:need to|must) (?:have|hold|possess))\b/i.test(value)) {
    return specializedCategory(value, "required_skill");
  }
  return null;
}

function skillSegments(text: string, span: Span, category: Category): Span[] {
  const value = text.slice(span.start, span.end);
  // Split only compact skill lists, never sentences, credentials, experience,
  // or alternatives whose commas could mean "choose one". Keep and/or intact.
  if (!(category === "required_skill" || category === "preferred_skill")
    || qualificationCue.test(value) || experienceCue.test(value)
    || /\bor\b|\b(?:we|you|they|candidates?|applicants?|must|required|preferred|including|such as)\b|[.!?](?:\s|$)/i.test(value)) return [span];
  return [...value.matchAll(/[^,;]+/g)].map((match) =>
    trimSpan(text, span.start + match.index, span.start + match.index + match[0].length));
}

export function extractJobDescription(text: string): JobProfile {
  inputSchema.parse(text);
  const requirements: JobRequirement[] = [];
  const candidates: Record<"title" | "company", JobProfile["title"][]> = { title: [], company: [] };
  const ambiguous = new Set<"title" | "company">();
  let context: Category | null = null;
  let capped = false;
  let oversized = false;
  let unrecognized = false;
  let excludedSection = false;

  const add = (span: Span, category: Category, source: JobRequirement["source"], split: boolean) => {
    const value = text.slice(span.start, span.end);
    if (!value.trim() || nonRequirementCue.test(value)) return;
    for (const part of split ? skillSegments(text, span, category) : [span]) {
      if (part.start >= part.end) continue;
      if (part.end - part.start > 2500) { oversized = true; continue; }
      const requirement = text.slice(part.start, part.end);
      if (negativeCue.test(requirement) || nonRequirementCue.test(requirement)) continue;
      if (requirements.length >= 100) { capped = true; continue; }
      const effectiveCategory = category === "preferred_skill" || explicitCategory(requirement) === "preferred_skill"
        ? "preferred_skill" : specializedCategory(requirement, category);
      requirements.push({
        id: `jd-${effectiveCategory}-${part.start}-${part.end}`,
        category: effectiveCategory, requirement, evidence: evidenceFor(text, part), source,
      });
    }
  };

  for (const line of text.matchAll(/[^\r\n]+/g)) {
    const original = trimSpan(text, line.index, line.index + line[0].length);
    let span = original;
    let value = text.slice(span.start, span.end);
    const marker = /^(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/.exec(value);
    const bullet = !!marker && !marker[0].startsWith("#");
    const markdownHeading = !!marker?.[0].startsWith("#");
    if (marker) {
      span = trimSpan(text, span.start + marker[0].length, span.end);
      value = text.slice(span.start, span.end);
    }
    if (!value) continue;

    // Bold labels are supported without altering the offsets of their values.
    const labelMatch = /^(?:\*\*)?([^:]{1,100}?)(?:\*\*)?\s*:(?:\*\*)?\s*/.exec(value);
    const bareLabel = normalizedLabel(value.replace(/^\*\*|\*\*$/g, ""));
    const label = labelMatch ? normalizedLabel(labelMatch[1] ?? "") : bareLabel;
    const field = labelMatch && Object.hasOwn(fieldLabels, label) ? fieldLabels[label] : undefined;
    if (field) {
      context = null;
      excludedSection = false;
      const fieldSpan = trimSpan(text, span.start + labelMatch![0].length, span.end);
      const fieldValue = text.slice(fieldSpan.start, fieldSpan.end);
      if (!fieldValue || fieldValue.length > 1000) ambiguous.add(field);
      else candidates[field].push({ value: fieldValue, evidence: evidenceFor(text, original) });
      continue;
    }

    const heading = Object.hasOwn(headings, label) ? headings[label] : undefined;
    if (heading) {
      context = heading;
      excludedSection = false;
      if (labelMatch) {
        let start = span.start + labelMatch[0].length;
        // Semicolons introduce labels; a period followed by whitespace introduces
        // only a known heading. Preserve sentence punctuation and names like .NET.
        for (const next of text.slice(start, span.end).matchAll(/(?:;\s*|\.\s+)(?:\*\*)?([A-Za-z][A-Za-z ’'/&-]{0,80}?)(?:\*\*)?:(?:\*\*)?\s*/g)) {
          const nextLabel = normalizedLabel(next[1] ?? "");
          const knownHeading = Object.hasOwn(headings, nextLabel);
          const period = next[0].startsWith(".");
          if (period && !knownHeading) continue;
          const boundary = span.start + labelMatch[0].length + next.index;
          if (context) add(trimSpan(text, start, boundary + (period ? 1 : 0)), context, "explicit-heading", true);
          context = knownHeading ? headings[nextLabel] ?? null : null;
          excludedSection = context === null;
          if (excludedSection) unrecognized = true;
          start = boundary + next[0].length;
        }
        if (context) add(trimSpan(text, start, span.end), context, "explicit-heading", true);
      }
      continue;
    }

    // Unknown colon/Markdown headings terminate context rather than inheriting
    // "required". Bare title-case boundaries need a section-like noun: title
    // casing alone would wrongly discard skills such as React Native.
    const titleCaseHeading = !bullet && /^[A-Z][\p{L}\d/&'-]*(?:\s+(?:[A-Z][\p{L}\d/&'-]*|and|of|the|&)){0,6}\s+(?:Section|Details|Information|Overview|Culture|Values|Mission|Process)$/u.test(value);
    if (labelMatch || markdownHeading || excludedLabel.test(label) || titleCaseHeading) {
      context = null;
      excludedSection = true;
      unrecognized = true;
      continue;
    }

    if (excludedSection) continue;
    const explicit = explicitCategory(value);
    // Explicit preference wins even inside a required section; a preferred
    // section always stays preferred, including experience and education.
    if (context) {
      if (negativeCue.test(value)) continue;
      const category = context === "preferred_skill" || explicit === "preferred_skill" ? "preferred_skill" : context;
      add(span, category, "explicit-heading", true);
    } else if (explicit) {
      add(span, explicit, "explicit-wording", false);
    }
  }

  const limitations = [
    "Conservative English-only extraction recognizes a limited set of explicit labels, headings and requirement cues; unrecognized wording or labels may be omitted. Missing fields or requirements are not proof of absence.",
    "Entries retain source wording; lists with alternatives stay together. Line-based parsing may omit or separate wrapped prose. Categories do not infer unstated facts or resolve nuanced, negated or conditional language. Offsets use original UTF-16 text and one-based lines.",
  ];
  const resolveField = (field: "title" | "company"): JobProfile["title"] => {
    const values = candidates[field];
    if (ambiguous.has(field) || new Set(values.map((entry) => entry?.value)).size > 1) {
      limitations.push(`The ${field} is ambiguous: explicit labels are conflicting, empty or over 1000 characters; no value was selected.`);
      return null;
    }
    const result = values[0] ?? null;
    if (!result) limitations.push(`No unambiguous explicit ${field} label was recognized; this does not prove the information is absent.`);
    return result;
  };
  const title = resolveField("title");
  const company = resolveField("company");
  if (unrecognized) limitations.push("Unrecognized or non-requirement section labels ended requirement context; their contents were omitted rather than guessed.");
  if (oversized) limitations.push("One or more entries over 2500 characters were skipped in full, not silently shortened.");
  if (capped) limitations.push("Requirements were truncated to the first 100 recognized entries; additional entries were omitted.");
  return validateJobProfile({ title, company, requirements, limitations, truncated: capped || oversized }, text);
}
