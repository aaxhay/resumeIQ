import "server-only";
import { GoogleGenAI, ApiError } from "@google/genai";
import type { z } from "zod";
import { generationSchema } from "./json-schema.ts";
import { reviewSchema, rewriteSchema, reviewRequestSchema } from "../../lib/ai-review/contracts.ts";
import { parseGeminiEnvironment } from "../../lib/config/env.ts";
import { AiError, invalidResponse } from "./errors.ts";
import { SYSTEM_INSTRUCTION, documentPrompt } from "./prompts.ts";
import { validateReview, validateRewrite } from "./validate.ts";
import type { ResumeAiProvider } from "./provider.ts";

export const PROVIDER_TIMEOUT_MS = 60_000;
export function createGeminiProvider(): ResumeAiProvider {
  let env;
  try { env = parseGeminiEnvironment(process.env); }
  catch { throw new AiError("NOT_CONFIGURED", "AI review is unavailable: the server needs a valid Gemini key and an explicitly selected model.", 503); }
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: PROVIDER_TIMEOUT_MS, retryOptions: { attempts: 1 } } });
  const model = env.GEMINI_MODEL;
  async function generate(prompt: string, schema: z.ZodType, signal?: AbortSignal, deadline = AbortSignal.timeout(PROVIDER_TIMEOUT_MS), validationFeedback?: string): Promise<unknown> {
    const combined = AbortSignal.any([deadline, ...(signal ? [signal] : [])]);
    try {
      combined.throwIfAborted();
      const response = await ai.models.generateContent({ model, contents: [{ role: "user", parts: [{ text: prompt }] }], config: {
        systemInstruction: SYSTEM_INSTRUCTION + (validationFeedback ? `\nVALIDATOR CORRECTION: A previous attempt was rejected (${validationFeedback}). Generate a fresh complete response. Each priority and strength MUST cite one to three exact resume substrings; if a missing section has no quote, prioritize an evidenced improvement instead. All ten distinct areas are required. For jobMatches use SHORT ATOMIC requirement phrases copied from the JD. A supported requirement must occur verbatim (ignoring case) inside at least one of its resume quotes. If it does not, use partially_supported with the relevant exact quote, or not_evidenced with an empty array. Do not invent or relax evidence. Return null for any rewrite that is not an exact contiguous excerpt of its original.` : ""),
        responseMimeType: "application/json", responseJsonSchema: generationSchema(schema),
        maxOutputTokens: 8192, temperature: 0.1, abortSignal: combined,
      } });
      if (response.candidates?.[0]?.finishReason !== "STOP" || !response.text || response.text.length > 100_000) throw invalidResponse();
      try { return JSON.parse(response.text) as unknown; } catch { throw invalidResponse(); }
    } catch (error: unknown) {
      if (signal?.aborted) throw new AiError("CANCELLED", "The request was cancelled. Provider processing may already have incurred a charge.", 499, true);
      if (deadline.aborted || (error instanceof Error && /timeout|timed out/i.test(error.message))) throw new AiError("TIMEOUT", "Gemini did not respond in time. Your text is unchanged. Retry later; a timed-out request may still be billed.", 504, true);
      if (error instanceof AiError) throw error;
      if (error instanceof ApiError && error.status === 429) throw new AiError("RATE_LIMIT", "Gemini's project quota or rate limit was reached. Wait before retrying and check project limits or billing if it persists.", 429, true);
      if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) throw new AiError("NOT_CONFIGURED", "Gemini rejected the configured model, credentials, access, or request settings. Check server configuration before retrying.", 503);
      throw new AiError("PROVIDER_ERROR", "Gemini is temporarily unavailable. No feedback was accepted. Please retry later.", 502, true);
    }
  }
  async function review(resumeText: string, jobDescription?: string, signal?: AbortSignal) {
    // This boundary is usable outside the route; do not rely only on HTTP validation.
    const common = { resumeText, consent: true, confirmed: true, synthetic: true, requestId: "00000000-0000-4000-8000-000000000000" };
    const parsed = reviewRequestSchema.safeParse(jobDescription === undefined ? { ...common, mode: "general" } : { ...common, mode: "job-specific", jobDescription });
    if (!parsed.success) throw new AiError("INVALID_REQUEST", "Supply valid bounded resume and job-description text.", 400);
    const deadline = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return validateReview(await generate(documentPrompt(resumeText, jobDescription), reviewSchema, signal, deadline, feedback), resumeText, jobDescription);
      } catch (error) {
        // One bounded format/evidence correction only, within the SAME deadline.
        // Never retry timeouts, quota, transport, safety blocks or access failures.
        if (attempt || !(error instanceof AiError) || error.code !== "INVALID_RESPONSE" || typeof error.cause !== "string" || !/^(schema-shape-or-bounds|non-exact-evidence|non-extractive-rewrite|introduced-number|unsupported-requirement-claim|requirement-not-in-job-evidence)/u.test(error.cause) || deadline.aborted || signal?.aborted) throw error;
        feedback = typeof error.cause === "string" ? error.cause : "validation failed";
      }
    }
    throw invalidResponse();
  }
  return {
    model,
    analyzeResume: (resumeText, signal) => review(resumeText, undefined, signal),
    analyzeJobMatch: (resumeText, jobDescription, signal) => review(resumeText, jobDescription, signal),
    async rewriteResumeBullet(bullet, signal) {
      if (!bullet.trim() || bullet.length > 2500) throw new AiError("INVALID_REQUEST", "Supply a nonempty bullet of at most 2,500 characters.", 400);
      return validateRewrite(await generate(JSON.stringify({ task: "extractive bullet shortening", untrustedDocuments: { bullet } }), rewriteSchema, signal), bullet);
    },
  };
}
