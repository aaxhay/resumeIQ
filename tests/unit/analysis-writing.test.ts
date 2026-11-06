import { describe, expect, it } from "vitest";
import type { AnalysisRule } from "@/lib/resume-analysis/contracts";
import { findingSchema } from "@/lib/resume-analysis/contracts";
import { parseResume } from "@/lib/resume-analysis/parse";
import {
  WRITING_RULES, repeatedPhrases, excessiveFiller, veryLongBullets,
  weakOpeningVerbs, firstPersonLanguage, unclearSentenceStructure,
} from "@/lib/resume-analysis/writing";

const analyze = (rule: AnalysisRule, text: string) => rule(parseResume(text));
const bulletOfLength = (count: number) => `- ${Array.from({ length: count }, () => "word").join(" ")}`;

// These are deliberately synthetic phrases, not resume excerpts.
describe("repeatedPhrases independently", () => {
  it("normalizes case and whitespace across three distinct bullets and groups overlapping phrases", () => {
    const text = "Experience\n- Worked closely with the support team on onboarding.\n- WORKED  closely with the support team on documentation.\n- Worked closely\n  with the support team on handovers.";
    const findings = analyze(repeatedPhrases, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain("3 distinct bullets");
    expect(findings[0]?.description).toContain("worked closely with the support");
    expect(findings[0]?.evidence_text).toBe("- Worked closely with the support team on onboarding.");
  });

  it.each([
    "- Worked closely with editors.\n- Worked closely with designers.",
    "- Worked closely with editors; worked closely with editors; worked closely with editors.",
    "- Worked closely.\n- Worked closely.\n- Worked closely.",
    "- Worked closely, with editors.\n- Worked closely, with designers.\n- Worked closely, with authors.",
    "- Continuous integration and deployment.\n- Continuous integration and deployment.\n- Continuous integration and deployment.",
    "- Developed API for clients.\n- Developed API for clients.\n- Developed API for clients.",
    "- Worked on machine learning models.\n- Worked on machine learning models.\n- Worked on machine learning models.",
    "- Worked with application programming interfaces.\n- Worked with application programming interfaces.\n- Worked with application programming interfaces.",
    "- Built machine learning models for testing.\n- Built machine learning models for testing.\n- Built machine learning models for testing.",
  ])("does not flag subthreshold, noncontiguous, or technical phrases: %s", (text) => {
    expect(analyze(repeatedPhrases, text)).toEqual([]);
  });

  it("includes exactly three-word phrases and does not silently cap separate groups", () => {
    const text = ["Worked with editors", "Helped with reviews", "Assisted with testing", "Collaborated with authors"]
      .flatMap((phrase) => Array.from({ length: 3 }, (_, index) => `- ${phrase}. Item ${index}.`)).join("\n");
    expect(analyze(repeatedPhrases, text)).toHaveLength(4);
  });
});

describe("excessiveFiller independently", () => {
  it.each([
    ["- Really worked very carefully on a guide.", 1],
    ["- Worked in order to document steps; actually published a guide.", 1],
    ["- Really, really focused on documentation.", 1],
    ["- Worked in order to document steps.", 0],
    ["- Built an actuality classifier with veryfast mode.", 0],
    ["Really very careful prose outside a bullet.", 0],
  ])("recognizes at least two whole-word occurrences: %s", (text, count) => {
    expect(analyze(excessiveFiller, text)).toHaveLength(count);
  });
});

describe("veryLongBullets independently", () => {
  it.each([[44, 0], [45, 0], [46, 1]])("uses a strict >45-word boundary (%i)", (words, count) => {
    expect(analyze(veryLongBullets, bulletOfLength(words))).toHaveLength(count);
  });
  it("counts wrapped bullet content but not a numbered marker", () => {
    const text = `7. ${Array(23).fill("word").join(" ")}\n  ${Array(23).fill("word").join(" ")}`;
    expect(analyze(veryLongBullets, text)).toHaveLength(1);
    expect(analyze(veryLongBullets, bulletOfLength(46).slice(2))).toEqual([]);
  });
});

describe("weakOpeningVerbs independently", () => {
  it.each(["Helped create a guide", "Assisted reviewers", "Worked on documentation", "Participated in testing", "Was involved in planning"])("suggests reviewing %s", (text) => {
    expect(analyze(weakOpeningVerbs, `- ${text}`)).toHaveLength(1);
  });
  it.each(["Built infrastructure", "Developed a guide", "Worked independently to publish a guide", "Created tools that helped reviewers", "Helper library maintenance"])("does not broadly penalize %s", (text) => {
    expect(analyze(weakOpeningVerbs, `- ${text}`)).toEqual([]);
  });
});

describe("firstPersonLanguage independently", () => {
  it.each([
    "- I developed a guide.", "- We supported reviewers.", "- Documented my workflow.",
    "Summary\nI enjoy writing clear documentation.", "Summary\nMy work focuses on documentation.",
  ])("finds first person in bullets and summary: %s", (text) => {
    expect(analyze(firstPersonLanguage, text)).toHaveLength(1);
  });
  it.each([
    "- Built UI and API infrastructure for the US team.",
    "- Maintained our team's guide.", "- Maintained my team’s guide.",
    '- Documented the label "My account".', '- Recorded feedback: “I found this useful”.',
    "- Documented the label 'My account'.", "- Recorded feedback: ‘We found this useful’.",
    "Experience\nI developed a guide.", "- Built a resume parser for consumers.",
  ])("ignores token substrings, team possessives, quotes, and non-summary prose: %s", (text) => {
    expect(analyze(firstPersonLanguage, text)).toEqual([]);
  });
  it("does not swallow a real pronoun next to an apostrophe", () => {
    expect(analyze(firstPersonLanguage, "- I updated the team's guide.")).toHaveLength(1);
  });
});

describe("unclearSentenceStructure independently", () => {
  it.each([[30, 4, 0], [31, 3, 0], [31, 4, 1], [45, 4, 1]])("requires >30 words and >=4 conjunctions (%i, %i)", (words, conjunctions, count) => {
    const text = `- ${[...Array(conjunctions).fill("and"), ...Array(words - conjunctions).fill("word")].join(" ")}`;
    const findings = analyze(unclearSentenceStructure, text);
    expect(findings).toHaveLength(count);
    if (count) expect(findings[0]?.description).toContain("not a grammar assessment");
  });
  it("does not treat conjunction substrings as conjunctions", () => {
    expect(analyze(unclearSentenceStructure, `- ${Array(35).fill("android").join(" ")}`)).toEqual([]);
  });
});

describe("writing rule contracts", () => {
  const fixtures: [AnalysisRule, string][] = [
    [repeatedPhrases, "- Worked with editors.\n- Worked with editors.\n- Worked with editors."],
    [excessiveFiller, "- Really very useful documentation."],
    [veryLongBullets, bulletOfLength(46)],
    [weakOpeningVerbs, "- Helped review documentation."],
    [firstPersonLanguage, "Summary\nI wrote documentation."],
    [unclearSentenceStructure, `- and or but and ${Array(27).fill("word").join(" ")}`],
  ];
  it("exports six independent rules", () => expect(WRITING_RULES).toEqual(fixtures.map(([rule]) => rule)));
  it.each(fixtures)("is pure, deterministic, advisory, and cites original spans (%#)", (rule, text) => {
    const context = parseResume(`\n${text}`);
    const snapshot = JSON.stringify(context);
    const findings = rule(context);
    expect(findings.length).toBeGreaterThan(0);
    expect(rule(context)).toEqual(findings);
    expect(JSON.stringify(context)).toBe(snapshot);
    for (const finding of findings) {
      expect(findingSchema.safeParse(finding).success).toBe(true);
      expect(finding).toMatchObject({ kind: "suggestion", severity: "info", detection_source: "deterministic", category: "writing" });
      expect(["medium", "low"]).toContain(finding.confidence);
      expect(finding.evidence_location).toBeDefined();
      const span = finding.evidence_location!;
      expect(context.text.slice(span.start_offset, span.end_offset)).toBe(finding.evidence_text);
      expect(span.start_line).toBe(context.text.slice(0, span.start_offset).split("\n").length);
      expect(span.end_line).toBe(context.text.slice(0, span.end_offset).split("\n").length);
    }
  });
  it("returns nothing for empty text", () => {
    for (const rule of WRITING_RULES) expect(analyze(rule, "")).toEqual([]);
  });
});
