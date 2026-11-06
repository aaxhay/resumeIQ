import { AREAS, reviewSchema, rewriteSchema, type AiReview, type Rewrite } from "../../lib/ai-review/contracts.ts";
import { invalidResponse } from "./errors.ts";
import { encodeClaimProblems, type ClaimProblem } from "./claim-diagnostics.ts";
import { affirmativeEvidence, containsInstruction, containsRequirementPhrase, evidenceContexts, literalEvidenceTerms, proseGroundingProblems, reviewProse } from "../../lib/ai-review/grounding.ts";
function exactQuotes(quotes: string[], source: string) {
  if (quotes.some(quote => !quote.trim() || !source.includes(quote))) throw invalidResponse("non-exact-evidence");
}
/** Deliberately extractive: no new words, facts, metrics or qualifications can be added.
 * This is not a proof that a shortened excerpt preserves every nuance. User review remains required. */
export function validateRewrite(input: unknown, source: string): Rewrite {
  const result = rewriteSchema.safeParse(input);
  if (!result.success || !result.data.revised.trim() || !source.includes(result.data.original) || !result.data.original.includes(result.data.revised)) throw invalidResponse("non-extractive-rewrite");
  return result.data;
}
export function validateReview(input: unknown, resume: string, job?: string): AiReview {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw invalidResponse(`schema-shape-or-bounds:${parsed.error.issues.map(issue => `${issue.path.join(".")}:${issue.code}`).slice(0, 5).join(",")}`);
  const data = parsed.data;
  if (new Set(data.areas.map(area => area.area)).size !== AREAS.length) throw invalidResponse("incomplete-area-coverage");
  if (new Set(data.findings.map(f => f.id)).size !== data.findings.length) throw invalidResponse("duplicate-finding-id");
  for (const item of [...data.priorities, ...data.strengths, ...data.findings]) exactQuotes(item.resumeEvidence, resume);
  for (const finding of data.findings) {
    if (finding.impact === "high" && !finding.resumeEvidence.length) throw invalidResponse("missing-high-impact-evidence");
    if (finding.suggestedRewrite) {
      validateRewrite(finding.suggestedRewrite, resume);
      if (!finding.resumeEvidence.some(quote => quote.includes(finding.suggestedRewrite!.original))) throw invalidResponse("uncited-rewrite");
    }
  }
  // A sparse description may contain no assessable requirements. Do not force
  // invented matches; the job inventory will retain extracted items as unassessed.
  if (!job && data.jobMatches.length) throw invalidResponse("unexpected-job-matches");
  const claimProblems: ClaimProblem[] = [];
  const sourceTerms = new Set(literalEvidenceTerms(resume));
  for (const [index, match] of data.jobMatches.entries()) {
    exactQuotes([match.jobEvidence], job ?? ""); exactQuotes(match.resumeEvidence, resume);
    const jobContexts = evidenceContexts(job ?? "", match.jobEvidence);
    if (containsInstruction(match.jobEvidence) || (jobContexts.length > 0 && jobContexts.every(containsInstruction))) throw invalidResponse("instruction-as-job-evidence");
    if (!jobContexts.length || !containsRequirementPhrase(match.jobEvidence, match.requirement)) throw invalidResponse("requirement-not-in-job-evidence");
    const affirmativeQuotes = match.resumeEvidence.filter(quote => evidenceContexts(resume, quote).some(affirmativeEvidence));
    if (match.status === "supported") {
      // Conjunction-separated requirements can be supported by separate exact quotes.
      // Every substantive term still needs literal lexical evidence; no inferred skills.
      const terms = literalEvidenceTerms(match.requirement).filter(term => !["and", "or", "and/or", "the", "a", "an", "with", "in", "of", "for", "to"].includes(term));
      const supplied = new Set(literalEvidenceTerms(affirmativeQuotes.join(" ")));
      // Whole-source tokens also prevent a citation cut from JavaScript/ASP.NET
      // from manufacturing a Java/.NET token that never existed in the resume.
      if (!terms.length || terms.some(term => !supplied.has(term) || !sourceTerms.has(term))) claimProblems.push({ reason: "unsupported-requirement-claim", path: `jobMatches.${index}.status` });
    }
    if (match.status === "partially_supported" && !affirmativeQuotes.length) throw invalidResponse("missing-partial-evidence");
    if (match.status === "not_evidenced" && match.resumeEvidence.length) throw invalidResponse("conflicting-match-evidence");
  }
  // Source-scoped numeric checks and a deliberately bounded technology/attribution
  // guard supplement exact quotes. They do not prove arbitrary semantic claims.
  for (const field of reviewProse(data)) {
    for (const reason of proseGroundingProblems(field, resume, job)) claimProblems.push({ reason, path: field.path });
  }
  if (claimProblems.length) throw invalidResponse(encodeClaimProblems(claimProblems));
  return data;
}
