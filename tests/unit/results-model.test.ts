import { describe, expect, it } from "vitest";
import { AREAS } from "../../src/lib/ai-review/contracts";
import { groupComparisons, groupFindings, COMPARISON_FILTERS } from "../../src/features/review/results-model";
import type { JobComparison } from "../../src/lib/job-description/analysis-contracts";
import { validAiReview } from "../fixtures/ai-review";

describe("results presentation grouping", () => {
  it("places each analysis area in exactly one requested finding group", () => {
    const sample = validAiReview().findings[0]!;
    const findings = AREAS.map((area, index) => ({ ...sample, id: `finding-${index}`, area }));
    const snapshot = structuredClone(findings);
    const groups = groupFindings(findings);
    expect(groups.map(group => group.title)).toEqual(["Content", "Writing and grammar", "Structure and formatting", "Achievements and impact", "Skills"]);
    const grouped = groups.flatMap(group => group.findings);
    expect(grouped).toHaveLength(AREAS.length);
    expect(new Set(grouped.map(item => item.id)).size).toBe(AREAS.length);
    expect(findings).toEqual(snapshot);
    for (const finding of grouped) expect(findings).toContain(finding);
  });
  it("retains empty groups without manufacturing findings", () => {
    expect(groupFindings([])).toHaveLength(5);
    expect(groupFindings([]).flatMap(group => group.findings)).toEqual([]);
  });
  it("filters statuses without changing judgments, evidence or source order", () => {
    const comparisons: JobComparison[] = COMPARISON_FILTERS.filter(status => status !== "all").map((status, index) => ({
      id: `test-${index}`, category: "required_skill", requirement: "TypeScript", jobEvidence: "TypeScript", status,
      resumeEvidence: status === "supported" || status === "partially_supported" ? ["TypeScript tools"] : [],
      explanation: "Synthetic comparison only.", recommendation: "Review evidence.", source: "validated-ai",
    }));
    const snapshot = structuredClone(comparisons);
    expect(groupComparisons(comparisons).flatMap(group => group.comparisons)).toEqual(comparisons);
    for (const status of COMPARISON_FILTERS) {
      const filtered = groupComparisons(comparisons, status).flatMap(group => group.comparisons);
      expect(filtered).toEqual(status === "all" ? comparisons : comparisons.filter(item => item.status === status));
      for (const item of filtered) expect(comparisons).toContain(item);
    }
    expect(comparisons).toEqual(snapshot);
  });
});
