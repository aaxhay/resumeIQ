import { describe, expect, it, vi } from "vitest";
import { analyzeJobDescription } from "../../src/server/ai/job-analysis";
import { jobAnalysisSchema } from "../../src/lib/job-description/analysis-contracts";
import { aiQuote, aiResume, validAiReview } from "../fixtures/ai-review";
vi.mock("server-only", () => ({}));
const job = "Job title: Developer\nCompany: Fictional Labs\nRequired skills: TypeScript, SQL\nPreferred skills: Kubernetes\nResponsibilities:\n- Write documentation\nExperience:\n- Production support\nEducation:\n- Bachelor degree";
function review() {
  const data = validAiReview(true);
  data.jobMatches = [
    { category: "required_skill", requirement: "TypeScript", jobEvidence: "TypeScript", status: "supported", resumeEvidence: [aiQuote], explanation: "Direct tool-building evidence is supplied.", recommendation: "Keep this evidence." },
    { category: "required_skill", requirement: "SQL", jobEvidence: "SQL", status: "partially_supported", resumeEvidence: [aiQuote], explanation: "Tool-building is relevant context but does not establish SQL experience.", recommendation: "Add SQL context only if true." },
    { category: "preferred_skill", requirement: "Kubernetes", jobEvidence: "Kubernetes", status: "not_evidenced", resumeEvidence: [], explanation: "Not evidenced in the preview, not proof of lacking this skill.", recommendation: "Add evidence only if true." },
  ];
  return data;
}

describe("validated job requirement inventory", () => {
  it("retains assessed evidence and labels every unmatched extracted requirement not assessed", () => {
    const result = analyzeJobDescription(review(), aiResume, job);
    expect(jobAnalysisSchema.safeParse(result).success).toBe(true);
    expect(result.profile.title?.value).toBe("Developer");
    expect(result.profile.company?.value).toBe("Fictional Labs");
    expect(result.comparisons.filter(item => item.requirement === "TypeScript")).toHaveLength(1);
    expect(result.comparisons.map(item => item.status)).toEqual(expect.arrayContaining(["supported", "partially_supported", "not_evidenced", "not_assessed"]));
    for (const item of result.comparisons) {
      expect(job).toContain(item.jobEvidence);
      for (const quote of item.resumeEvidence) expect(aiResume).toContain(quote);
      if (item.source === "unassessed-extraction") {
        expect(item.status).toBe("not_assessed");
        expect(item.resumeEvidence).toEqual([]);
      }
    }
    expect(result.comparisons.some(item => item.requirement === "Write documentation" && item.status === "not_assessed")).toBe(true);
  });
  it("never promotes a composite requirement from a narrower skill match", () => {
    const composite = job.replace("TypeScript, SQL", "TypeScript and SQL");
    const result = analyzeJobDescription(review(), aiResume, composite);
    expect(result.comparisons).toEqual(expect.arrayContaining([expect.objectContaining({ requirement: "TypeScript and SQL", status: "not_assessed", source: "unassessed-extraction" })]));
  });
  it("does not consume a differently categorized extracted requirement", () => {
    const data = review();
    data.jobMatches[0]!.category = "technical_requirement";
    const result = analyzeJobDescription(data, aiResume, job);
    expect(result.comparisons).toEqual(expect.arrayContaining([expect.objectContaining({ requirement: "TypeScript", category: "required_skill", status: "not_assessed" })]));
  });
  it("ambiguous duplicate provider matches cannot consume an extracted requirement", () => {
    const data = review();
    data.jobMatches.push({ ...data.jobMatches[0]! });
    const result = analyzeJobDescription(data, aiResume, job);
    expect(result.comparisons.filter(item => item.requirement === "TypeScript")).toHaveLength(3);
    expect(result.comparisons.at(-1)?.source).toBe("unassessed-extraction");
    expect(result.comparisons.some(item => item.requirement === "TypeScript" && item.status === "not_assessed")).toBe(true);
  });
  it("keeps validated AI requirements even when the conservative parser cannot classify prose", () => {
    const prose = "Our fictional team works together. We value TypeScript and clear documentation in everyday work.";
    const data = review(); data.jobMatches = [data.jobMatches[0]!];
    const result = analyzeJobDescription(data, aiResume, prose);
    expect(result.profile.title).toBeNull(); expect(result.profile.company).toBeNull();
    expect(result.comparisons[0]?.source).toBe("validated-ai");
  });
  it("permits an empty assessment and keeps extracted requirements explicitly unassessed", () => {
    const result = analyzeJobDescription(validAiReview(), aiResume, job);
    expect(result.comparisons.length).toBeGreaterThan(0);
    expect(result.comparisons.every(item => item.status === "not_assessed" && item.source === "unassessed-extraction")).toBe(true);
  });
  it("keeps sparse job descriptions empty instead of inventing requirements", () => {
    const sparse = "Company: Fictional Labs\nAbout us:\nWe are a fictional company providing tools for our customers.";
    const result = analyzeJobDescription(validAiReview(), aiResume, sparse);
    expect(result.profile.company?.value).toBe("Fictional Labs");
    expect(result.profile.title).toBeNull();
    expect(result.comparisons).toEqual([]);
  });
  it("rejects fabricated resume quotes before building any results", () => {
    const data = review(); data.jobMatches[0]!.resumeEvidence = ["Invented TypeScript experience"];
    expect(() => analyzeJobDescription(data, aiResume, job)).toThrow();
  });
  it("rejects job quotes not in the supplied description", () => {
    const data = review(); data.jobMatches[0]!.jobEvidence = "TypeScript expertise required";
    expect(() => analyzeJobDescription(data, aiResume, job)).toThrow();
  });
  it("rejects unsupported claims rather than fabricating a fallback match", () => {
    const data = review(); data.jobMatches[2]!.status = "supported";
    expect(() => analyzeJobDescription(data, aiResume, job)).toThrow();
  });
  it("is deterministic and does not mutate the validated provider output", () => {
    const data = review(); const before = structuredClone(data);
    expect(analyzeJobDescription(data, aiResume, job)).toEqual(analyzeJobDescription(data, aiResume, job));
    expect(data).toEqual(before);
  });
});
