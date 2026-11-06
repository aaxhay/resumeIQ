import { describe, expect, it } from "vitest";
import type { AnalysisRule } from "@/lib/resume-analysis/contracts";
import { findingSchema } from "@/lib/resume-analysis/contracts";
import { parseResume } from "@/lib/resume-analysis/parse";
import {
  ACHIEVEMENT_RULES, responsibilityOnlyWording, vagueAchievementContext, repetitiveBulletOpenings,
} from "@/lib/resume-analysis/achievement";

const analyze = (rule: AnalysisRule, text: string) => rule(parseResume(text));

describe("responsibilityOnlyWording independently", () => {
  it.each([
    "Responsible for maintaining the internal documentation library.",
    "Duties included reviewing incoming support requests.",
    "Tasked with coordinating the editorial calendar.",
    "In charge of the shared documentation library.",
    "Accountable for maintaining deployment scripts.",
  ])("recognizes explicit responsibility framing: %s", (text) => {
    expect(analyze(responsibilityOnlyWording, `Experience\n- ${text}`)).toHaveLength(1);
  });
  it.each([
    "Responsible for documentation that enabled self-service onboarding.",
    "Responsible for a guide so that reviewers could work independently.",
    "Responsible for documentation; improved navigation.",
    "Responsible for support; reduced duplicate requests.",
    "Responsible for support; published a troubleshooting guide.",
    "Responsible for operations; built a deployment tool.",
    "Responsible for support; resolved the migration blocker.",
    "Responsible for work that resulted in simpler handovers.",
    "Tasked with a migration; delivered a working replacement.",
    "Responsible for support, allowing colleagues to find answers.",
    "Built infrastructure.",
    "Created an onboarding guide for new reviewers.",
  ])("accepts qualitative outcomes, nonnumeric deliverables, and ordinary action wording: %s", (text) => {
    expect(analyze(responsibilityOnlyWording, `Experience\n- ${text}`)).toEqual([]);
  });
  it("does not mistake an outcome token substring for a cue", () => {
    expect(analyze(responsibilityOnlyWording, "- Responsible for the unresolved support queue.")).toHaveLength(1);
  });
  it("does not require or reward numbers in place of context", () => {
    expect(analyze(responsibilityOnlyWording, "- Responsible for maintaining 12 documentation libraries.")).toHaveLength(1);
    expect(analyze(responsibilityOnlyWording, "- Published a documentation library.")).toEqual([]);
  });
  it("leaves a short vague responsibility to one combined context finding", () => {
    const text = "- Responsible for various tasks.";
    expect(analyze(responsibilityOnlyWording, text)).toEqual([]);
    expect(analyze(vagueAchievementContext, text)).toHaveLength(1);
    expect(ACHIEVEMENT_RULES.flatMap((rule) => analyze(rule, text))).toHaveLength(1);
  });
});

describe("vagueAchievementContext independently", () => {
  it.each(["Helped with tasks.", "Worked on projects.", "Assisted the team.", "Handled various daily tasks.", "Supported some general team project tasks."])("offers one combined specificity/context suggestion: %s", (text) => {
    const findings = analyze(vagueAchievementContext, `Projects\n- ${text}`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.recommendation).toContain("numbers are not required");
  });
  it.each([
    "Helped.", // A lone word may be a label, not a contribution.
    "Supported some general daily team project tasks.", // Seven words, outside the deliberately narrow check.
    "Built infrastructure.", "Developed an API.", "Assisted with deployment.",
    "Worked on accessibility testing.", "Published onboarding documentation.",
  ])("does not flag concrete work or words outside the narrow 2–6-word pattern: %s", (text) => {
    expect(analyze(vagueAchievementContext, `- ${text}`)).toEqual([]);
  });
});

describe("repetitiveBulletOpenings independently", () => {
  it("groups case-normalized openings at exactly three eligible bullets", () => {
    const text = "Experience\n- Built an onboarding guide.\n- BUILT a deployment tool.\nProjects\n- Built a parser.";
    const findings = analyze(repetitiveBulletOpenings, text);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.description).toContain("3 eligible bullets");
    expect(findings[0]?.evidence_text).toBe("- Built an onboarding guide.");
  });
  it.each([
    "- Built a guide.\n- Built a tool.",
    "- Built a guide.\n- Created a tool.\n- Documented a parser.",
    "- Python and SQL.\n- Python and Java.\n- Python and Ruby.",
    "Experience\n- Built a guide.\n- Built a tool.\nSkills\n- Built a parser.",
  ])("ignores below-threshold or non-action openings: %s", (text) => {
    expect(analyze(repetitiveBulletOpenings, text)).toEqual([]);
  });
  it("returns one representative for each separate repeated opening with unique IDs", () => {
    const text = ["Built", "Created", "Designed", "Delivered"].flatMap((verb) =>
      ["a guide", "a tool", "a parser"].map((object) => `- ${verb} ${object}.`)).join("\n");
    const findings = analyze(repetitiveBulletOpenings, text);
    expect(findings).toHaveLength(4);
    expect(new Set(findings.map((finding) => finding.id)).size).toBe(4);
  });
});

describe("achievement scope and contracts", () => {
  const fixtures: [AnalysisRule, string][] = [
    [responsibilityOnlyWording, "- Responsible for maintaining deployment scripts."],
    [vagueAchievementContext, "- Helped with tasks."],
    [repetitiveBulletOpenings, "- Built a guide.\n- Built a tool.\n- Built a parser."],
  ];
  it("exports three independent rules", () => expect(ACHIEVEMENT_RULES).toEqual(fixtures.map(([rule]) => rule)));
  it.each(fixtures)("restricts achievement checks to experience, projects, and unsectioned bullets (%#)", (rule, text) => {
    for (const heading of ["Skills", "Education", "Summary", "Certifications", "Languages", "Contact Information"]) {
      expect(analyze(rule, `${heading}\n${text}`)).toEqual([]);
    }
    for (const heading of ["", "Experience\n", "Projects\n"]) {
      expect(analyze(rule, `${heading}${text}`)).toHaveLength(1);
    }
    expect(analyze(rule, text.replaceAll("- ", ""))).toEqual([]);
  });
  it.each(fixtures)("is pure, deterministic, advisory, and cites original spans (%#)", (rule, text) => {
    const context = parseResume(`\nExperience\n${text}`);
    const snapshot = JSON.stringify(context);
    const findings = rule(context);
    expect(findings).toHaveLength(1);
    expect(rule(context)).toEqual(findings);
    expect(JSON.stringify(context)).toBe(snapshot);
    for (const finding of findings) {
      expect(findingSchema.safeParse(finding).success).toBe(true);
      expect(finding).toMatchObject({ kind: "suggestion", severity: "info", detection_source: "deterministic", category: "achievement" });
      expect(["medium", "low"]).toContain(finding.confidence);
      expect(finding.evidence_location).toBeDefined();
      const span = finding.evidence_location!;
      expect(context.text.slice(span.start_offset, span.end_offset)).toBe(finding.evidence_text);
      expect(span.start_line).toBe(context.text.slice(0, span.start_offset).split("\n").length);
      expect(span.end_line).toBe(context.text.slice(0, span.end_offset).split("\n").length);
    }
  });
  it("preserves wrapped bullet evidence and line ranges", () => {
    const text = "Projects\n  • Responsible for maintaining\n    the shared documentation library.";
    const finding = analyze(responsibilityOnlyWording, text)[0];
    expect(finding?.evidence_text).toBe("  • Responsible for maintaining\n    the shared documentation library.");
    expect(finding?.evidence_location).toMatchObject({ start_line: 2, end_line: 3 });
  });
  it("returns no findings for empty text", () => {
    for (const rule of ACHIEVEMENT_RULES) expect(analyze(rule, "")).toEqual([]);
  });
});
