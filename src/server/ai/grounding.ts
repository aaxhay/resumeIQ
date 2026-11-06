import type { AiReview } from "../../lib/ai-review/contracts.ts";

/** Narrow lexical guards, NOT semantic entailment or a complete skill inventory. */
const wordCharacter = /[\p{L}\p{N}_+#]/u;
function boundary(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? "";
  const after = text[end] ?? "";
  return !wordCharacter.test(before) && !wordCharacter.test(after)
    && before !== "." && before !== "/"
    && !(after === "." && /[\p{L}\p{N}]/u.test(text[end + 1] ?? ""))
    && after !== "/";
}
/** Preserve technical token identity on the resume side too: ASP.NET is not .NET,
 * JavaScript is not Java, and C++/C# are not C. Sentence punctuation is not a token. */
export function literalEvidenceTerms(text: string): string[] {
  return text.toLowerCase().match(/\.?[\p{L}\p{N}_]+(?:[./][\p{L}\p{N}_]+)*(?:[+#]+)?/gu) ?? [];
}
/** A phrase must be verbatim and cannot be a fragment of a different technical token. */
export function containsRequirementPhrase(source: string, phrase: string): boolean {
  if (!phrase.trim()) return false;
  for (let start = source.indexOf(phrase); start !== -1; start = source.indexOf(phrase, start + 1)) {
    if (boundary(source, start, start + phrase.length)) return true;
  }
  return false;
}

const technologies = [
  ["CI/CD", "ci/cd", "ci / cd", "continuous integration and continuous delivery", "continuous integration and continuous deployment"],
  ["microservices", "microservice", "microservices"],
  ...["Python", "TypeScript", "JavaScript", "Java", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Kubernetes", "Docker", "Terraform", "Rust", "AWS", "Azure", "React", "C++", "C#", "C", ".NET", "ASP.NET"].map(name => [name, name.toLowerCase()]),
] as const;
export function mentionedTechnologies(text: string): string[] {
  const lower = text.toLowerCase();
  return technologies.filter(([, ...aliases]) => aliases.some(alias => containsRequirementPhrase(lower, alias))).map(([name]) => name!);
}

export function containsInstruction(text: string): boolean {
  return /\b(?:ignore|disregard|override)\b.{0,80}\b(?:instructions?|rules?|prompts?)\b|\b(?:system prompt|injection_success)\b/iu.test(text);
}
/** Reject only recognizable instruction/negative-experience evidence. Other semantic errors remain possible. */
export function affirmativeEvidence(text: string): boolean {
  return !containsInstruction(text) && !/\b(?:no|without)\b.{0,40}\bexperience\b|\b(?:do not|don't|does not|doesn't|never)\s+(?:have|use|used|work|worked|hold|held)\b|\b(?:hope|wish|want|plan)\s+to\b/iu.test(text);
}
function usableSource(text: string): string {
  return clauses(text).filter(affirmativeEvidence).join("\n");
}
function clauses(text: string): string[] {
  // Keep decimal points and technical names intact; do not let a conditional in
  // another sentence exempt a factual assertion. This is deliberately not an NLP parser.
  return text.split(/(?<=[.!?;])\s+|\n+|\s+\b(?:but|whereas|however)\b\s*|,\s*(?=(?:you|your|the candidate)\b)/iu).filter(Boolean);
}
const jobAttribution = /\b(?:job(?:\s+description)?|jd|role|employer)(?:'s)?\b.{0,100}\b(?:requires?|requests?|asks?|expects?|seeks?|needs?|requirements?|qualifications?|mentions?|lists?|specifies?|calls for|preferences?)\b|\b(?:requirements?|required|preferred)\s+(?:by|for|in)\s+(?:the\s+)?(?:job|jd|role)\b|\b(?:meet|satisfy|match|align with)\b.{0,60}\b(?:job|jd|role)\b.{0,30}\brequirements?\b|\b(?:is|are)\s+(?:required|mandatory|preferred)\b/iu;
const candidateAssertion = /\b(?:you|the candidate|the applicant)\s+(?:have|has|are|is|built|led|earned|hold|holds|demonstrate|demonstrates|possess|possesses)\b|\byour\b.{0,80}\b(?:experience|certification|expertise|proficiency|leadership|achievement|work)\b|\b(?:resume|candidate|applicant)\b.{0,60}\b(?:demonstrates?|shows?|proves?|establishes?)\b/iu;
const negativeJobAttribution = /\b(?:does not|doesn't|doesn’t)\s+(?:require|mention|request|specify|list)\b|\bnot\s+(?:an?\s+)?(?:explicit(?:ly stated)?\s+|stated\s+)?(?:job\s+)?requirement\b/iu;
const conditionalAdvice = /\b(?:if (?:true|accurate|applicable|relevant)|only if (?:you|it)|if you (?:have|actually|can truthfully))\b/iu;
const adviceAction = /\b(?:add|include|describe|mention|clarify|list|document|provide|highlight)\b/iu;

/** Only explicit common assertion forms. Unknown employers/qualifications in other
 * wording still require human semantic review; this is not a factuality classifier. */
export function explicitCandidateFacts(text: string): string[] {
  const patterns = [
    /\b(?:you (?:have|hold|earned)|your|the candidate (?:has|holds))\s+(?:an?\s+)?((?:[\p{L}+#./-]+[ \t]+){0,4}(?:certification|certificate|doctorate|phd|mba|(?:bachelor|master)(?:'s)? degree))\b/giu,
    /\byou\s+(?:worked|served|were employed)\s+(?:at|for)\s+([^.!?;\n,]+)/giu,
    /\byou\s+(?:are|were|served as)\s+(?:an?\s+)?((?:senior|staff|principal|lead|chief)\s+(?:[\p{L}-]+\s+){0,3}(?:engineer|developer|architect|officer|manager|director))\b/giu,
  ];
  return patterns.flatMap(pattern => [...text.matchAll(pattern)].map(match => match[1]!.trim()));
}

export type ProseField = { path: string; text: string; resumeEvidence?: string[]; jobEvidence?: string };
function conditionalAddition(field: ProseField, clause: string): boolean {
  return field.path.endsWith(".recommendation") && conditionalAdvice.test(clause) && adviceAction.test(clause);
}
export function hasUnsupportedCandidateFact(field: ProseField, resume: string): boolean {
  const source = usableSource(field.resumeEvidence?.length ? field.resumeEvidence.join("\n") : resume).toLowerCase();
  return clauses(field.text).some(clause => !conditionalAddition(field, clause) && explicitCandidateFacts(clause).some(fact => !containsRequirementPhrase(source, fact.toLowerCase())));
}
export function reviewProse(data: AiReview): ProseField[] {
  return [
    { path: "assessment", text: data.assessment },
    ...data.priorities.flatMap((x, i) => [{ path: `priorities.${i}.title`, text: x.title, resumeEvidence: x.resumeEvidence }, { path: `priorities.${i}.recommendation`, text: x.recommendation, resumeEvidence: x.resumeEvidence }]),
    ...data.strengths.flatMap((x, i) => [{ path: `strengths.${i}.title`, text: x.title, resumeEvidence: x.resumeEvidence }, { path: `strengths.${i}.explanation`, text: x.explanation, resumeEvidence: x.resumeEvidence }]),
    ...data.areas.map((x, i) => ({ path: `areas.${i}.explanation`, text: x.explanation })),
    ...data.findings.flatMap((x, i) => [{ path: `findings.${i}.issue`, text: x.issue, resumeEvidence: x.resumeEvidence }, { path: `findings.${i}.whyItMatters`, text: x.whyItMatters, resumeEvidence: x.resumeEvidence }, { path: `findings.${i}.recommendation`, text: x.recommendation, resumeEvidence: x.resumeEvidence }]),
    ...data.jobMatches.flatMap((x, i) => [{ path: `jobMatches.${i}.explanation`, text: x.explanation, resumeEvidence: x.resumeEvidence, jobEvidence: x.jobEvidence }, { path: `jobMatches.${i}.recommendation`, text: x.recommendation, resumeEvidence: x.resumeEvidence, jobEvidence: x.jobEvidence }]),
    ...data.limitations.map((text, i) => ({ path: `limitations.${i}`, text })),
  ];
}
function numbers(text: string): string[] {
  return [
    ...(text.match(/\d+(?:[.,]\d+)*(?:%|\+)?/gu) ?? []),
    // Bounded common spelled quantities with units, not every use of 'one' in prose.
    ...(text.toLowerCase().match(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)\s+(?:years?|months?|percent|employees?|people|projects?|users?|customers?)\b/gu) ?? []),
  ];
}
export function proseGroundingProblems(field: ProseField, resume: string, job?: string): ("introduced-number" | "unsupported-job-claim" | "unsupported-prose-claim")[] {
  const problems = new Set<"introduced-number" | "unsupported-job-claim" | "unsupported-prose-claim">();
  const resumeSource = usableSource(field.resumeEvidence?.length ? field.resumeEvidence.join("\n") : resume);
  const jobSource = usableSource(field.jobEvidence ?? job ?? "");
  const candidateTechnologies = new Set(mentionedTechnologies(resumeSource));
  const jobTechnologies = new Set(mentionedTechnologies(jobSource));
  if (hasUnsupportedCandidateFact(field, resume)) problems.add("unsupported-prose-claim");
  for (const clause of clauses(field.text)) {
    const attributedToJob = jobAttribution.test(clause);
    const candidateClaim = candidateAssertion.test(clause) || field.path.startsWith("strengths.");
    const advice = conditionalAddition(field, clause);
    const negativeJobClaim = attributedToJob && negativeJobAttribution.test(clause);
    for (const technology of mentionedTechnologies(clause)) {
      // Job attribution is checked even when advice is conditional or the resume
      // happens to contain the technology. Resume skills never create job requirements.
      if (attributedToJob && !negativeJobClaim && !jobTechnologies.has(technology)) problems.add("unsupported-job-claim");
      if (!advice && !negativeJobClaim && !(attributedToJob && !candidateClaim)
        && !(candidateClaim ? candidateTechnologies.has(technology) : candidateTechnologies.has(technology) || jobTechnologies.has(technology))) problems.add("unsupported-prose-claim");
    }
    // Candidate numbers never borrow JD-only values. Mixed job explanations may
    // cite either source unless they explicitly assert a candidate achievement.
    const numericSource = candidateClaim ? resumeSource
      : attributedToJob ? jobSource : field.jobEvidence ? `${resumeSource}\n${jobSource}` : resumeSource;
    const supplied = new Set(numbers(numericSource));
    if (numbers(clause).some(number => !supplied.has(number))) problems.add("introduced-number");
  }
  return [...problems];
}
