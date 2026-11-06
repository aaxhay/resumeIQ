import { describe, expect, it } from "vitest";
import { parseResume, headingKinds } from "@/lib/resume-analysis/parse";
import { checkContact, checkCoreSections, checkDateFormats, checkHeadings, checkSectionContent } from "@/lib/resume-analysis/structure";
import { strongResume, sparseResume, unusualFormattingResume } from "../fixtures/analysis-resumes";

const context = (text: string) => parseResume(text);

describe("contact presence", () => {
  it.each(["morgan@example.test", "+44 20 7946 0958", "(202) 555-0142", "https://linkedin.com/in/synthetic-person"])("recognizes %s without requiring other private details", (text) => {
    expect(checkContact(context(text))).toEqual([]);
  });
  it("reports absence of a detectable pattern without inventing evidence", () => {
    const [finding] = checkContact(context("Morgan Example\n2019 - 2022\nEducation"));
    expect(finding).toMatchObject({ kind: "suggestion", confidence: "low", evidence_text: "" });
    expect(finding?.evidence_location).toBeUndefined();
  });
  it("does not mistake calendar dates for a phone number", () => {
    expect(checkContact(context("2022-01-01 - 2024-01-01"))).toHaveLength(1);
  });
});

describe("headings and section presence", () => {
  it.each(["EXPERIENCE", "# Professional Experience:", "1. Work History"])("recognizes standalone %s", (heading) => {
    expect(headingKinds(heading)).toEqual(["experience"]);
  });
  it("recognizes combined headings but not prose or arbitrary uppercase names", () => {
    expect(headingKinds("Education / Certifications")).toEqual(["education", "other"]);
    expect(headingKinds("Experience and Projects")).toEqual(["experience", "projects"]);
    expect(headingKinds("I have experience building tools.")).toBeUndefined();
    expect(headingKinds("MORGAN EXAMPLE")).toBeUndefined();
  });
  it("warns only about recognition for unrecognized headings", () => {
    expect(checkHeadings(context("MY JOURNEY\nBuilt useful tools."))[0]).toMatchObject({ kind: "suggestion", confidence: "low" });
    expect(checkHeadings(context(strongResume))).toEqual([]);
    expect(checkCoreSections(context("MY JOURNEY\nBuilt useful tools."))).toEqual([]);
  });
  it.each(["experience", "education", "skills"])("detects an unrecognized %s section without claiming it is required", (kind) => {
    const headings = ["experience", "education", "skills"].filter((value) => value !== kind);
    const findings = checkCoreSections(context(headings.map((heading) => `${heading}\nExample content for this section`).join("\n\n")));
    expect(findings.map((finding) => finding.rule_id)).toEqual([`structure.${kind}-not-detected`]);
    expect(findings[0]?.recommendation).toContain("If");
  });
  it("does not assume projects are relevant; explicit opt-in enables the check", () => {
    const text = "Experience\nBuilt tools\nEducation\nCollege\nSkills\nRust";
    expect(checkCoreSections(context(text))).toEqual([]);
    expect(checkCoreSections(parseResume(text, { projectsRelevant: true }))).toEqual([expect.objectContaining({ rule_id: "structure.projects-not-detected" })]);
    expect(checkCoreSections(parseResume(strongResume, { projectsRelevant: true }))).toEqual([]);
  });
});

describe("section content", () => {
  it("identifies genuinely empty recognized sections and includes heading evidence", () => {
    const findings = checkSectionContent(context(sparseResume));
    expect(findings.filter((finding) => finding.rule_id === "structure.empty-section").map((finding) => finding.evidence_text)).toEqual(["EXPERIENCE", "SKILLS"]);
    expect(findings.filter((finding) => finding.rule_id === "structure.empty-section").every((finding) => finding.kind === "objective" && finding.confidence === "high")).toBe(true);
  });
  it("uses a documented short-section trigger without penalizing concise skill lists", () => {
    expect(checkSectionContent(context("Skills\nRust"))).toEqual([]);
    expect(checkSectionContent(context("Education\nComputing"))[0]?.rule_id).toBe("structure.short-section");
    expect(checkSectionContent(context("Education\nExample College Bachelor of Computing"))).toEqual([]);
  });
  it("recognizes bullet-only whitespace as no readable content", () => {
    expect(checkSectionContent(context("Experience\n- \n\nSkills\nRust"))[0]?.rule_id).toBe("structure.empty-section");
  });
  it("does not split the experience section at an uppercase employer name", () => {
    const parsed = context("Experience\nFICTIONAL COMPANY\n- Built a reliable deployment checklist.\nEducation\nExample College Bachelor of Computing");
    expect(parsed.sections).toHaveLength(2);
    expect(checkSectionContent(parsed)).toEqual([]);
  });
});

describe("date format consistency", () => {
  it("flags mixed month/year formats within the same section", () => {
    const findings = checkDateFormats(context(unusualFormattingResume));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence_text).toBe("Jan 2022 - 03/2024");
    expect(findings[0]?.kind).toBe("suggestion");
  });
  it.each([
    "Experience\nJanuary 2022 - Mar 2024",
    "Experience\n2022 - 2024\nJan 2020 - Feb 2021",
    "Experience\n01/2022 - 03/2024\nEducation\nJan 2021",
    "Contact\n2022-03 and 04/2023",
  ])("avoids false positives for year-only, separate sections, or equivalent named months", (text) => {
    expect(checkDateFormats(context(text))).toEqual([]);
  });
  it("recognizes ISO month format without asserting chronology or missing months", () => {
    expect(checkDateFormats(context("Experience\n2022-01 - 2023-06\n07/2023 - 08/2024"))).toHaveLength(1);
  });
});
