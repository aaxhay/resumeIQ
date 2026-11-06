import type { ValidationIssue } from "../../lib/ai-review/contracts.ts";
import { decodeClaimProblems } from "./claim-diagnostics.ts";

// Only these static diagnostics can cross the API boundary or trigger correction.
// Never return a provider message, rejected output, or the original cause string.
const failures: Readonly<Record<string, { issue: ValidationIssue; correctable: boolean }>> = {
  "schema-shape-or-bounds": { issue: "format", correctable: true },
  "incomplete-area-coverage": { issue: "coverage", correctable: true },
  "duplicate-finding-id": { issue: "format", correctable: true },
  "unexpected-job-matches": { issue: "format", correctable: true },
  "non-exact-evidence": { issue: "evidence", correctable: true },
  "missing-high-impact-evidence": { issue: "evidence", correctable: true },
  "missing-partial-evidence": { issue: "evidence", correctable: true },
  "conflicting-match-evidence": { issue: "evidence", correctable: true },
  "non-extractive-rewrite": { issue: "rewrite", correctable: true },
  "uncited-rewrite": { issue: "rewrite", correctable: true },
  "introduced-number": { issue: "unverified_number", correctable: true },
  "unsupported-requirement-claim": { issue: "job_claim", correctable: true },
  "requirement-not-in-job-evidence": { issue: "evidence", correctable: true },
  "instruction-as-job-evidence": { issue: "job_claim", correctable: true },
  "output-token-limit": { issue: "output_limit", correctable: false },
  "oversized-output": { issue: "output_limit", correctable: false },
  "blocked-output": { issue: "blocked", correctable: false },
  "incomplete-output": { issue: "incomplete", correctable: false },
  "empty-output": { issue: "incomplete", correctable: false },
  "invalid-json": { issue: "format", correctable: false },
};
export function validationFailure(reason: unknown) {
  if (typeof reason !== "string") return undefined;
  const problems = decodeClaimProblems(reason);
  if (problems) {
    const numbers = problems.some(problem => problem.reason === "introduced-number");
    const matches = problems.some(problem => problem.reason === "unsupported-requirement-claim" || problem.reason === "unsupported-job-claim");
    const prose = problems.some(problem => problem.reason === "unsupported-prose-claim");
    const issue: ValidationIssue = prose || (numbers && matches) ? "unsupported_claim" : numbers ? "unverified_number" : "job_claim";
    return { issue, correctable: true };
  }
  // Schema diagnostics carry validator-generated paths/codes internally only.
  const key = reason.startsWith("schema-shape-or-bounds:") ? "schema-shape-or-bounds" : reason;
  return Object.hasOwn(failures, key) ? failures[key] : undefined;
}
