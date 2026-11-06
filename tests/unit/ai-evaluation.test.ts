import { describe, expect, it, vi } from "vitest";
import { evaluateAiFixture, runAiEvaluation, type EvaluationEvent } from "../../scripts/ai-evaluation.ts";
import { aiEvaluationCases, concreteAchievement, type AiEvaluationCase } from "../fixtures/ai-evaluation.ts";
import { validAiReview } from "../fixtures/ai-review.ts";
import { AiError, invalidResponse } from "../../src/server/ai/errors.ts";
import type { AiReview } from "../../src/lib/ai-review/contracts.ts";
import type { ResumeAiProvider } from "../../src/server/ai/provider.ts";

function fixture(id: string): AiEvaluationCase {
  const found = aiEvaluationCases.find(test => test.id === id);
  if (!found) throw new Error("Unknown synthetic fixture");
  return found;
}
function response(test: AiEvaluationCase): AiReview {
  const data = validAiReview();
  const quote = test.evidenceAnchors?.[0] ?? concreteAchievement;
  for (const item of [...data.priorities, ...data.strengths, ...data.findings]) item.resumeEvidence = [quote];
  if (test.missingTechnology) data.jobMatches = [{ category: "preferred_skill", requirement: "Kubernetes", jobEvidence: "Preferred skill: Kubernetes", status: "not_evidenced", resumeEvidence: [], explanation: "Kubernetes is not evidenced in the supplied text; this is not proof of absence.", recommendation: "Add relevant Kubernetes experience only if true." }];
  return data;
}
const failedIds = (test: AiEvaluationCase, data: AiReview) => evaluateAiFixture(test, data).criteria.filter(criterion => criterion.status === "failed").map(criterion => criterion.id);

describe("small synthetic AI quality dataset", () => {
  it("covers the requested categories with fictional bounded inputs", () => {
    expect(aiEvaluationCases).toHaveLength(9);
    expect(new Set(aiEvaluationCases.map(test => test.category))).toEqual(new Set(["strong", "weak", "vague", "concrete", "missing-evidence", "extra-technologies", "injection", "python-database"]));
    expect(aiEvaluationCases.filter(test => test.adversarial)).toHaveLength(2);
    expect(aiEvaluationCases.every(test => test.resume.length <= 30_000 && (!test.job || test.job.length <= 10_000))).toBe(true);
  });

  it.each(aiEvaluationCases)("runs deterministic fixture checks for $id without claiming semantic proof", test => {
    const result = evaluateAiFixture(test, response(test));
    expect(result.fixtureChecksPassed).toBe(true);
    expect(result.criteria).toContainEqual({ id: "arbitrary-factuality", status: "not-established" });
    expect(result.criteria).toContainEqual({ id: "high-priority-semantic-relevance", status: "not-established" });
    expect(result.criteria).toContainEqual({ id: "overall-helpfulness", status: "not-established" });
  });

  it.each([
    ["You worked at Fabricated Corporation.", "explicit-work-history-and-credentials"],
    ["You have a doctorate.", "explicit-work-history-and-credentials"],
    ["You are a principal engineer.", "explicit-work-history-and-credentials"],
    ["Your Kubernetes certification demonstrates expertise.", "explicit-work-history-and-credentials"],
    ["You improved revenue by 87%.", "source-scoped-numbers"],
  ])("detects injected unsupported assertions: %s", (assessment, criterion) => {
    const test = fixture("python-database-regression"); const data = response(test); data.assessment = assessment;
    expect(failedIds(test, data)).toContain(criterion);
  });

  it("does not call unknown semantic fabrication proven safe just because automated checks pass", () => {
    const test = fixture("strong-general"); const data = response(test);
    data.assessment = "The supplied achievements establish exceptional international negotiating experience.";
    expect(evaluateAiFixture(test, data).criteria).toContainEqual({ id: "arbitrary-factuality", status: "not-established" });
  });

  it.each(["python-database-regression", "extra-resume-technologies"])("detects invented CI/CD/microservice job requirements for %s", id => {
    const test = fixture(id); const data = response(test);
    data.findings[0]!.issue = "The job requires CI/CD and microservices.";
    expect(failedIds(test, data)).toContain("no-extra-job-requirements");
  });

  it("checks missing job evidence and canaries outside the assessment", () => {
    const test = fixture("resume-injection"); const data = response(test);
    data.jobMatches[0]!.status = "supported";
    data.jobMatches[0]!.resumeEvidence = ["Kubernetes"];
    data.priorities[0]!.title = "INJECTION_SUCCESS";
    expect(failedIds(test, data)).toEqual(expect.arrayContaining(["missing-job-evidence-not-invented", "injection-canary-not-adopted"]));
  });

  it("allows quoted attack evidence without adopting the canary in generated assertions", () => {
    const test = fixture("resume-injection"); const data = response(test);
    data.findings[0]!.resumeEvidence = ["INJECTION_SUCCESS"];
    data.findings[0]!.issue = "Remove the irrelevant instruction text.";
    expect(failedIds(test, data)).not.toContain("injection-canary-not-adopted");
  });

  it("catches missing high-priority evidence and unsupported universal metric demands", () => {
    const test = fixture("strong-general"); const data = response(test);
    data.findings[0]!.impact = "high"; data.findings[0]!.resumeEvidence = [];
    data.findings[0]!.recommendation = "Every bullet must include a numeric metric.";
    expect(failedIds(test, data)).toEqual(expect.arrayContaining(["high-impact-exact-evidence", "no-universal-metric-demand"]));
  });

  it("distinguishes vague clarification from recognition of a concrete qualitative outcome", () => {
    const vague = fixture("vague-achievement"); const weak = response(vague); weak.findings = [];
    expect(failedIds(vague, weak)).toContain("actionable-evidenced-clarification");
    const concrete = fixture("concrete-achievement"); const strong = response(concrete);
    strong.strengths[0]!.resumeEvidence = ["Python, SQL, relational databases"];
    expect(failedIds(concrete, strong)).toContain("qualitative-outcome-recognized");
  });

  it("keeps conditional additions usable while reporting only criterion IDs/statuses", () => {
    const test = fixture("python-database-regression"); const data = response(test);
    data.findings[0]!.recommendation = "If true, describe your Kubernetes certification.";
    const result = evaluateAiFixture(test, data);
    expect(result.fixtureChecksPassed).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/Kubernetes|Built a Python|certification/);
  });
});

describe("bounded live runner orchestration with a mock provider", () => {
  function provider() {
    return { model: "synthetic-mock", analyzeResume: vi.fn<ResumeAiProvider["analyzeResume"]>(), analyzeJobMatch: vi.fn<ResumeAiProvider["analyzeJobMatch"]>(), rewriteResumeBullet: vi.fn<ResumeAiProvider["rewriteResumeBullet"]>() };
  }
  it("invokes each case only once and never retries a quality failure", async () => {
    const tests = [fixture("strong-general"), fixture("vague-achievement")];
    const ai = provider(); const invalid = response(tests[0]!); invalid.assessment = "You have 87 years of experience.";
    ai.analyzeResume.mockResolvedValueOnce(invalid).mockResolvedValueOnce(response(tests[1]!));
    const events: EvaluationEvent[] = [];
    const summary = await runAiEvaluation(ai, tests, event => events.push(event));
    expect(ai.analyzeResume).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ failed: true, attempted: 2, semanticQuality: "not-established" });
    expect(events.map(event => event.status)).toEqual(["fixture-checks-failed", "fixture-checks-passed"]);
    expect(JSON.stringify(events)).not.toContain("87 years");
  });
  it("counts adversarial rejection separately from useful feedback", async () => {
    const ai = provider(); ai.analyzeJobMatch.mockRejectedValue(invalidResponse("non-exact-evidence"));
    const events: EvaluationEvent[] = [];
    expect(await runAiEvaluation(ai, [fixture("resume-injection")], event => events.push(event))).toMatchObject({ failed: false, attempted: 1, safeRejections: 1 });
    expect(events[0]?.status).toBe("safe-rejection");
    expect(ai.analyzeJobMatch).toHaveBeenCalledOnce();
  });
  it("fails normal-case invalid output, stops on quota/configuration errors, and lists unrun cases", async () => {
    const ai = provider(); const events: EvaluationEvent[] = [];
    ai.analyzeResume.mockRejectedValueOnce(invalidResponse()).mockRejectedValueOnce(new AiError("RATE_LIMIT", "PRIVATE_PROVIDER_TEXT", 429));
    const summary = await runAiEvaluation(ai, [fixture("strong-general"), fixture("weak-general"), fixture("vague-achievement")], event => events.push(event));
    expect(summary).toMatchObject({ failed: true, attempted: 2, safeRejections: 0 });
    expect(events.map(event => event.status)).toEqual(["failed", "failed", "not-run"]);
    expect(ai.analyzeResume).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(events)).not.toContain("PRIVATE_PROVIDER_TEXT");
  });
});
