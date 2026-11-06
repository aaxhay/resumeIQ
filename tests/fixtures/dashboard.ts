import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewResponseSchema, type AiReview, type ReviewRequest } from "../../src/lib/ai-review/contracts";
import { jobAnalysisSchema } from "../../src/lib/job-description/analysis-contracts";
import { validateReview } from "../../src/server/ai/validate";

/** Mock only the provider boundary, retaining production evidence and job analysis semantics. */
export function dashboardResponse(body: ReviewRequest, input: AiReview) {
  const data = validateReview(input, body.resumeText, body.mode === "job-specific" ? body.jobDescription : undefined);
  let jobAnalysis = null;
  if (body.mode === "job-specific") {
    // Playwright runs outside React's server condition. Execute the actual server-only
    // analyzer in a bounded Node subprocess rather than duplicating its matching rules.
    const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/server/ai/job-analysis.ts")).href;
    const child = spawnSync(process.execPath, ["--conditions=react-server", "--input-type=module", "--eval", `
      import { readFileSync } from "node:fs";
      import { analyzeJobDescription } from ${JSON.stringify(moduleUrl)};
      const { data, resume, job } = JSON.parse(readFileSync(0, "utf8"));
      process.stdout.write(JSON.stringify(analyzeJobDescription(data, resume, job)));
    `], { input: JSON.stringify({ data, resume: body.resumeText, job: body.jobDescription }), encoding: "utf8", timeout: 10_000, maxBuffer: 1_000_000 });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Synthetic job analyzer failed: ${child.stderr}`);
    jobAnalysis = jobAnalysisSchema.parse(JSON.parse(child.stdout));
  }
  const response = reviewResponseSchema.parse({ ok: true, model: "gemini-synthetic-test", redacted: false, data, jobAnalysis });
  if (!response.ok) throw new Error("Expected a validated synthetic success response");
  return response;
}

export const dashboardJob = `Required skills:
- accessible tools
- automated tests
Preferred skills:
- Kubernetes
- mentoring
Responsibilities:
- Document development practices`;

/** All requirement and evidence text is literal supplied text; partial support has evidence. */
export function dashboardJobMatches(quote: string): AiReview["jobMatches"] {
  return [
    { category: "required_skill", requirement: "accessible tools", jobEvidence: "- accessible tools", status: "supported", resumeEvidence: [quote], explanation: "The supplied sentence explicitly names accessible tools.", recommendation: "Keep the supplied evidence visible." },
    { category: "required_skill", requirement: "automated tests", jobEvidence: "- automated tests", status: "partially_supported", resumeEvidence: [quote], explanation: "The preview mentions automated tests but provides limited scope.", recommendation: "Clarify the scope only if true." },
    { category: "preferred_skill", requirement: "Kubernetes", jobEvidence: "- Kubernetes", status: "not_evidenced", resumeEvidence: [], explanation: "Not evidenced in the supplied preview; this does not establish a lack of skill.", recommendation: "Add relevant evidence only if true." },
    { category: "preferred_skill", requirement: "mentoring", jobEvidence: "- mentoring", status: "not_assessed", resumeEvidence: [], explanation: "No assessment of this requirement was returned.", recommendation: "Review this requirement manually." },
  ];
}
