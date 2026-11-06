import { parseGeminiEnvironment } from "@/lib/config/env";
import { prepareAiText } from "@/lib/ai-review/privacy";
import { reviewRequestSchema, reviewResponseSchema } from "@/lib/ai-review/contracts";
import { analyzeJobDescription } from "@/server/ai/job-analysis";
import { createGeminiProvider } from "@/server/ai/gemini";
import { readReviewRequest } from "@/server/ai/request";
import { acquireReview } from "@/server/ai/guard";
import { AiError, safeAiFailure } from "@/server/ai/errors";
import { validateReview } from "@/server/ai/validate";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
// Explicit operator attestation, not auto-detection of billing or legal compliance.
const personalDataEnabled = () => process.env.GEMINI_DATA_POLICY === "paid-reviewed";
export async function GET() {
  let configured = false;
  try { parseGeminiEnvironment(process.env); configured = true; } catch { /* No credential detail leaves the server. */ }
  return Response.json({ configured, personalDataEnabled: personalDataEnabled() }, { headers });
}
export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    const input = await readReviewRequest(request);
    if (!input.synthetic && !personalDataEnabled()) throw new AiError("PRIVACY_GATE", "This installation permits synthetic examples only. Real personal documents require an operator-reviewed paid-service configuration and data-handling policy.", 403);
    const resumeText = prepareAiText(input.resumeText);
    const jobDescription = input.mode === "job-specific" ? prepareAiText(input.jobDescription) : undefined;
    if (!reviewRequestSchema.safeParse({ ...input, resumeText, ...(jobDescription === undefined ? {} : { jobDescription }) }).success) throw new AiError("INVALID_REQUEST", "After contact minimization, the text is outside the supported analysis bounds. Review the provider preview.", 400);
    const provider = createGeminiProvider();
    release = acquireReview(input.requestId, JSON.stringify({ mode: input.mode, resumeText, jobDescription }));
    const output = jobDescription === undefined ? await provider.analyzeResume(resumeText, request.signal) : await provider.analyzeJobMatch(resumeText, jobDescription, request.signal);
    // Validate at the application boundary as well: alternative providers must obey the same contract.
    const data = validateReview(output, resumeText, jobDescription);
    const jobAnalysis = jobDescription === undefined ? null : analyzeJobDescription(data, resumeText, jobDescription);
    const response = reviewResponseSchema.parse({ ok: true, data, jobAnalysis, model: provider.model, redacted: resumeText !== input.resumeText || (input.mode === "job-specific" && jobDescription !== input.jobDescription) });
    return Response.json(response, { headers });
  } catch (error) {
    const failure = safeAiFailure(error);
    return Response.json(failure.body, { status: failure.status, headers: { ...headers, ...(failure.status === 429 || failure.status === 409 ? { "Retry-After": "60" } : {}) } });
  } finally { release?.(); }
}
