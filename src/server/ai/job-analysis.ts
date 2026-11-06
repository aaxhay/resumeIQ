import "server-only";
import { extractJobDescription, validateJobProfile } from "../../lib/job-description/extract.ts";
import { jobAnalysisSchema, type JobAnalysis } from "../../lib/job-description/analysis-contracts.ts";
import { validateReview } from "./validate.ts";

/** No second model call, inferred matches, or score. Unknown matches remain unassessed. */
export function analyzeJobDescription(input: unknown, resume: string, job: string): JobAnalysis {
  const review = validateReview(input, resume, job);
  const profile = validateJobProfile(extractJobDescription(job), job);
  const comparisons: JobAnalysis["comparisons"] = review.jobMatches.map((match, index) => ({
    ...match, id: `ai-${index}`, source: "validated-ai",
  }));
  for (const requirement of profile.requirements) {
    // Exact wording/category only. A narrower AI match cannot cover a composite
    // requirement. Repeated identical passages cannot be distinguished by quotes.
    const matches = review.jobMatches.filter(match =>
      match.category === requirement.category &&
      match.requirement === requirement.requirement &&
      match.jobEvidence.includes(requirement.evidence.text));
    if (matches.length === 1) continue;
    comparisons.push({
      id: `extracted-${requirement.id}`,
      category: requirement.category,
      requirement: requirement.requirement,
      jobEvidence: requirement.evidence.text,
      status: "not_assessed",
      resumeEvidence: [],
      explanation: "This explicit job requirement was extracted, but no unique exact requirement/category comparison was returned for it. No conclusion about your experience can be drawn.",
      recommendation: "Review this requirement against your resume manually. Add relevant evidence only if it is true.",
      source: "unassessed-extraction",
    });
  }
  return jobAnalysisSchema.parse({ profile, comparisons });
}
