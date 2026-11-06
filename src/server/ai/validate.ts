import { AREAS, reviewSchema, rewriteSchema, type AiReview, type Rewrite } from "../../lib/ai-review/contracts.ts";
import { invalidResponse } from "./errors.ts";

const normalized = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();
function exactQuotes(quotes: string[], source: string) {
  if (quotes.some(quote => !quote.trim() || !source.includes(quote))) throw invalidResponse("non-exact-evidence");
}
/** Deliberately extractive: no new words, facts, metrics or qualifications can be added.
 * This is not a proof that a shortened excerpt preserves every nuance. User review remains required. */
export function validateRewrite(input: unknown, source: string): Rewrite {
  const result = rewriteSchema.safeParse(input);
  if (!result.success || !source.includes(result.data.original) || !result.data.original.includes(result.data.revised)) throw invalidResponse("non-extractive-rewrite");
  return result.data;
}
export function validateReview(input: unknown, resume: string, job?: string): AiReview {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw invalidResponse(`schema-shape-or-bounds:${parsed.error.issues.map(issue => `${issue.path.join(".")}:${issue.code}`).slice(0, 5).join(",")}`);
  const data = parsed.data;
  if (new Set(data.areas.map(area => area.area)).size !== AREAS.length || new Set(data.findings.map(f => f.id)).size !== data.findings.length) throw invalidResponse();
  for (const item of [...data.priorities, ...data.strengths, ...data.findings]) exactQuotes(item.resumeEvidence, resume);
  for (const finding of data.findings) {
    if (finding.impact === "high" && !finding.resumeEvidence.length) throw invalidResponse();
    if (finding.suggestedRewrite) {
      validateRewrite(finding.suggestedRewrite, resume);
      if (!finding.resumeEvidence.some(quote => quote.includes(finding.suggestedRewrite!.original))) throw invalidResponse();
    }
  }
  if ((!job && data.jobMatches.length) || (job && !data.jobMatches.length)) throw invalidResponse();
  for (const match of data.jobMatches) {
    exactQuotes([match.jobEvidence], job ?? ""); exactQuotes(match.resumeEvidence, resume);
    if (!normalized(match.jobEvidence).includes(normalized(match.requirement))) throw invalidResponse("requirement-not-in-job-evidence");
    if (match.status === "supported") {
      // Conjunction-separated requirements can be supported by separate exact quotes.
      // Every substantive term still needs literal lexical evidence; no inferred skills.
      const terms = normalized(match.requirement).split(" ").filter(term => !["and", "or", "the", "a", "an", "with", "in", "of", "for", "to"].includes(term));
      const supplied = ` ${normalized(match.resumeEvidence.join(" "))} `;
      if (!terms.length || terms.some(term => !supplied.includes(` ${term} `))) throw invalidResponse("unsupported-requirement-claim");
    }
    if (match.status === "partially_supported" && !match.resumeEvidence.length) throw invalidResponse();
    if (match.status === "not_evidenced" && match.resumeEvidence.length) throw invalidResponse();
  }
  // Reject introduced numbers throughout generated assessment/recommendation prose.
  // Numbers in exact job quotes are not candidate achievements; rewrites are checked against their own original.
  const suppliedNumbers = new Set((resume + "\n" + (job ?? "")).match(/\d+(?:[.,]\d+)*(?:%|\+)?/gu) ?? []);
  const prose = [data.assessment, ...data.priorities.flatMap(x => [x.title, x.recommendation]), ...data.strengths.flatMap(x => [x.title, x.explanation]), ...data.areas.map(x => x.explanation), ...data.findings.flatMap(x => [x.issue, x.whyItMatters, x.recommendation]), ...data.jobMatches.flatMap(x => [x.explanation, x.recommendation]), ...data.limitations].join("\n");
  if ((prose.match(/\d+(?:[.,]\d+)*(?:%|\+)?/gu) ?? []).some(number => !suppliedNumbers.has(number))) throw invalidResponse("introduced-number");
  return data;
}
