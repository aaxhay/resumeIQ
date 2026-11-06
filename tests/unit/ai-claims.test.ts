import { describe, expect, it } from "vitest";
import { validateReview } from "@/server/ai/validate";
import { decodeClaimProblems, encodeClaimProblems } from "@/server/ai/claim-diagnostics";
import { invalidResponse, safeAiFailure } from "@/server/ai/errors";
import { validationFailure } from "@/server/ai/validation-failures";
import { reviewResponseSchema } from "@/lib/ai-review/contracts";
import { aiJob, aiQuote, aiResume, validAiReview } from "../fixtures/ai-review";

function rejection(input: unknown, job = aiJob) {
  try { validateReview(input, aiResume, job); } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error("Expected rejected synthetic review");
}

describe("targeted claim validation diagnostics", () => {
  it("collects all unsupported job matches and numeric prose fields without including their text", () => {
    const data = validAiReview(true);
    data.jobMatches[1]!.status = "supported";
    data.jobMatches[1]!.resumeEvidence = [aiQuote];
    data.jobMatches.push({ ...data.jobMatches[1]! });
    data.assessment = "PRIVATE_MODEL_TEXT: invented 77 years of experience.";
    data.jobMatches[0]!.recommendation = "PRIVATE_MODEL_TEXT: add an invented 99% improvement.";
    const error = rejection(data);
    expect(decodeClaimProblems(error.cause)).toEqual([
      { reason: "unsupported-requirement-claim", path: "jobMatches.1.status" },
      { reason: "unsupported-requirement-claim", path: "jobMatches.2.status" },
      { reason: "introduced-number", path: "assessment" },
      { reason: "introduced-number", path: "jobMatches.0.recommendation" },
    ]);
    expect(String(error.cause)).not.toContain("PRIVATE_MODEL_TEXT");
    expect(String(error.cause)).not.toContain("77");
    expect(String(error.cause)).not.toContain("Kubernetes");
    const publicFailure = safeAiFailure(error);
    expect(publicFailure.body.error.validationIssue).toBe("unsupported_claim");
    expect(JSON.stringify(publicFailure)).not.toContain("jobMatches");
    expect(JSON.stringify(publicFailure)).not.toContain("PRIVATE_MODEL_TEXT");
  });

  it("retains strict lexical support while accepting explicitly cautious relevant evidence", () => {
    const job = "Fictional software role. Required: Experience with TypeScript. Preferred: Kubernetes.";
    const data = validAiReview(true);
    data.jobMatches[0]!.requirement = "Experience with TypeScript";
    data.jobMatches[0]!.jobEvidence = "Experience with TypeScript";
    expect(safeAiFailure(rejection(data, job)).body.error.validationIssue).toBe("job_claim");
    data.jobMatches[0]!.status = "partially_supported";
    data.jobMatches[0]!.explanation = "The supplied tool-building quote is relevant, but the complete requirement is not explicitly evidenced.";
    expect(validateReview(data, aiResume, job).jobMatches[0]?.status).toBe("partially_supported");
  });

  it("does not change valid output or silently downgrade an unsupported claim", () => {
    const data = validAiReview(true);
    expect(validateReview(data, aiResume, aiJob)).toEqual(data);
    data.jobMatches[1]!.status = "supported";
    const snapshot = structuredClone(data);
    rejection(data);
    expect(data).toEqual(snapshot);
    expect(data.jobMatches[1]!.status).toBe("supported");
  });

  it.each([
    ["introduced-number", "findings.0.recommendation", "unverified_number"],
    ["unsupported-requirement-claim", "jobMatches.0.status", "job_claim"],
  ] as const)("returns an allowlisted category for %s without internal field paths", (reason, path, issue) => {
    const diagnostic = encodeClaimProblems([{ reason, path }]);
    expect(validationFailure(diagnostic)).toEqual({ issue, correctable: true });
    const response = safeAiFailure(invalidResponse(diagnostic)).body;
    expect(response.error.validationIssue).toBe(issue);
    expect(reviewResponseSchema.safeParse(response).success).toBe(true);
    expect(JSON.stringify(response)).not.toContain(path);
    expect(JSON.stringify(response)).not.toContain(diagnostic);
  });

  it.each([
    "claim-checks:",
    "claim-checks:introduced-number@PRIVATE_DOCUMENT",
    "claim-checks:introduced-number@assessment@PRIVATE_DOCUMENT",
    "claim-checks:unsupported-requirement-claim@jobMatches.0.explanation",
    "claim-checks:unsupported-requirement-claim@jobMatches.999.status",
    "claim-checks:constructor@assessment",
    "claim-checks:introduced-number@assessment;PRIVATE_DOCUMENT",
  ])("does not recognize malformed or potentially private diagnostic %s", value => {
    expect(decodeClaimProblems(value)).toBeUndefined();
    expect(validationFailure(value)).toBeUndefined();
    expect(safeAiFailure(invalidResponse(value)).body.error).not.toHaveProperty("validationIssue");
  });

  it("bounds correction diagnostics and rejects invalid internal paths", () => {
    const entries = Array.from({ length: 100 }, () => ({ reason: "introduced-number" as const, path: "assessment" }));
    expect(decodeClaimProblems(encodeClaimProblems(entries))).toHaveLength(24);
    expect(decodeClaimProblems("claim-checks:" + "introduced-number@assessment;".repeat(100))).toBeUndefined();
    expect(() => encodeClaimProblems([{ reason: "introduced-number", path: "PRIVATE_DOCUMENT" }])).toThrow();
    expect(() => encodeClaimProblems([])).toThrow();
  });
});
