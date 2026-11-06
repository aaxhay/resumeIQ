import { describe, expect, it, vi } from "vitest";
import { analyzeResume, findingSchema, MAX_FINDINGS } from "@/lib/resume-analysis";
import { parseResume } from "@/lib/resume-analysis/parse";
import { poorlyStructuredResume, repetitiveResume, sparseResume, strongResume, unusualFormattingResume } from "../fixtures/analysis-resumes";

const fixtures = { strongResume, poorlyStructuredResume, repetitiveResume, sparseResume, unusualFormattingResume };

describe("standalone deterministic analysis", () => {
  it.each(Object.entries(fixtures))("returns typed deterministic evidence-backed findings for %s", (_name, text) => {
    const options = Object.freeze({ projectsRelevant: true });
    const first = analyzeResume(text, options);
    expect(analyzeResume(text, options)).toEqual(first);
    expect(new Set(first.map((finding) => finding.id)).size).toBe(first.length);
    for (const finding of first) {
      expect(findingSchema.safeParse(finding).success).toBe(true);
      expect(finding.detection_source).toBe("deterministic");
      expect(finding).not.toHaveProperty("score");
      const location = finding.evidence_location;
      if (location) {
        expect(text.slice(location.start_offset, location.end_offset)).toBe(finding.evidence_text);
        expect(location.start_line).toBe(text.slice(0, location.start_offset).split("\n").length);
        expect(location.end_line).toBe(text.slice(0, location.end_offset).split("\n").length);
      } else expect(finding.evidence_text).toBe("");
    }
  });
  it("does not invent problems for a strong nonnumeric resume", () => {
    expect(analyzeResume(strongResume)).toEqual([]);
  });
  it("finds objective sparse-section and repeated-word observations", () => {
    expect(analyzeResume(sparseResume)).toEqual(expect.arrayContaining([expect.objectContaining({ rule_id: "structure.empty-section", kind: "objective" })]));
    expect(analyzeResume(unusualFormattingResume)).toEqual(expect.arrayContaining([expect.objectContaining({ rule_id: "readability.repeated-word", evidence_text: "the the" })]));
  });
  it("reports unfamiliar labels as limited recognition, not inferred missing facts", () => {
    const results = analyzeResume("PARCOURS\nCréation de logiciels pour une équipe fictive.");
    expect(results.find((finding) => finding.rule_id === "structure.headings-not-detected")?.confidence).toBe("low");
  });
  it("requires valid bounded normalized text and valid explicit options", () => {
    for (const text of ["", " \n ", "text\r\ntext", "a".repeat(80_001)]) expect(() => analyzeResume(text)).toThrow();
    expect(() => analyzeResume("Sparse")).not.toThrow();
    expect(() => analyzeResume("x".repeat(80_000))).not.toThrow();
    expect(() => analyzeResume(strongResume, JSON.parse('{"projectsRelevant":"yes"}'))).toThrow();
    expect(() => analyzeResume(strongResume, JSON.parse('{"unknown":true}'))).toThrow();
  });
  it("does not depend on clock, randomness, or network access", () => {
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Randomness not allowed"); });
    const now = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("Clock not allowed"); });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Network not allowed"); });
    try {
      expect(analyzeResume(repetitiveResume)).toEqual(analyzeResume(repetitiveResume));
      expect(fetch).not.toHaveBeenCalled();
      expect(now).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); now.mockRestore(); fetch.mockRestore(); }
  });
  it("bounds results with an explicit omission notice, not a hidden passing claim", () => {
    const results = analyzeResume("word word\n".repeat(240));
    expect(results).toHaveLength(MAX_FINDINGS);
    expect(results.at(-1)?.rule_id).toBe("analysis.finding-limit");
    expect(results.at(-1)?.description).toContain("Only the first 199");
  });
});

describe("source parser", () => {
  it("retains offsets and headings in unusual extracted formatting", () => {
    const parsed = parseResume(unusualFormattingResume);
    expect(parsed.sections.map((section) => section.kinds)).toEqual([["experience"], ["education", "other"], ["skills"], ["projects"]]);
    expect(parsed.bullets[0]?.text).toContain("\n  It enabled consistent deployment reviews.");
    expect(parsed.bullets[0]?.startLine).toBe(6);
  });
  it("keeps unindented job titles outside the preceding bullet", () => {
    const parsed = parseResume("Experience\n- Built a guide.\nNew role at Fictional Company\n- Created a tool.");
    expect(parsed.bullets.map((bullet) => bullet.text)).toEqual(["- Built a guide.", "- Created a tool."]);
    expect(parsed.paragraphs[0]?.text).toBe("New role at Fictional Company");
  });
  it("supports UTF-16 offsets even with emoji before evidence", () => {
    const text = "🙂 Morgan\nExperience\n- Built the the guide.";
    const finding = analyzeResume(text).find((entry) => entry.rule_id === "readability.repeated-word");
    expect(text.slice(finding?.evidence_location?.start_offset, finding?.evidence_location?.end_offset)).toBe("the the");
  });
});
