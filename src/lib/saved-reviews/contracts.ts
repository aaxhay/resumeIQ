import { z } from "zod";
import type { AiReview } from "../ai-review/contracts";
import { isSafeAiRewrite } from "../resume-improvement/editor";

const short = z.string().trim().min(1).max(500);
const prose = z.string().trim().min(1).max(1200);
const excerpt = z.string().min(1).max(2500).refine(value => value.trim().length > 0);
export const savedAnalysisSchema = z.object({
  version: z.literal(1), assessment: prose,
  priorities: z.array(z.object({ title: short, recommendation: prose }).strict()).length(3),
  strengths: z.array(z.object({ title: short, explanation: prose }).strict()).min(1).max(5),
  limitations: z.array(short).min(1).max(5),
}).strict().refine(value => new TextEncoder().encode(JSON.stringify(value)).length <= 32_000, "Saved summary is too large");
export const savedSuggestionSchema = z.object({
  finding_id: z.string().regex(/^[a-z0-9-]{1,60}$/u),
  original_text: excerpt, suggested_text: excerpt,
  status: z.enum(["pending", "accepted", "rejected", "manually_edited"]),
}).strict();
export const saveReviewRequestSchema = z.object({
  id: z.uuid(), consent: z.literal(true), review_mode: z.enum(["general", "job-specific"]),
  resume_filename: z.string().trim().min(1).max(160).regex(/^[^\p{Cc}]+$/u).nullable(),
  analysis_result: savedAnalysisSchema,
  suggestions: z.array(savedSuggestionSchema).max(12),
}).strict().refine(value => new Set(value.suggestions.map(item => item.finding_id)).size === value.suggestions.length);
export type SaveReviewRequest = z.infer<typeof saveReviewRequestSchema>;
export const savedReviewSchema = z.object({
  id: z.uuid(), review_mode: z.enum(["general", "job-specific"]), resume_filename: z.string().max(160).nullable(),
  analysis_result: savedAnalysisSchema, created_at: z.iso.datetime({ offset: true }),
  resume_suggestions: z.array(savedSuggestionSchema).max(12),
}).strict();
export type SavedReview = z.infer<typeof savedReviewSchema>;
export const accountSchema = z.object({ ok: z.literal(true), configured: z.boolean(), historyEnabled: z.boolean(), historySetupRequired: z.boolean().optional(), user: z.object({ email: z.string().email() }).strict().nullable() }).strict();
export const accountActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign-in"), email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).strict(),
  z.object({ action: z.literal("sign-up"), email: z.string().trim().email().max(254), password: z.string().min(12).max(128) }).strict(),
  z.object({ action: z.literal("sign-out") }).strict(),
]);
export const accountActionResponseSchema = z.object({ ok: z.literal(true), confirmationRequired: z.boolean() }).strict();
export const historyListSchema = z.object({ ok: z.literal(true), reviews: z.array(savedReviewSchema).max(20) }).strict();
export const savedResponseSchema = z.object({ ok: z.literal(true), id: z.uuid() }).strict();
export const deletedResponseSchema = z.object({ ok: z.literal(true) }).strict();
export const historyErrorSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.enum(["NOT_CONFIGURED", "HISTORY_DISABLED", "HISTORY_NOT_READY", "UNAUTHORIZED", "INVALID_REQUEST", "AUTH_FAILED", "BUSY", "STORAGE_ERROR", "NOT_FOUND"]), message: z.string() }).strict() }).strict();
export type HistoryErrorCode = z.infer<typeof historyErrorSchema>["error"]["code"];

/** Deliberate data minimization: no documents, JD, job quotes, model metadata, or complete review JSON. */
export function reviewSummary(review: AiReview): Pick<SaveReviewRequest, "analysis_result" | "suggestions"> {
  return {
    analysis_result: {
      version: 1, assessment: review.assessment,
      priorities: review.priorities.map(({ title, recommendation }) => ({ title, recommendation })),
      strengths: review.strengths.map(({ title, explanation }) => ({ title, explanation })),
      limitations: [...review.limitations],
    },
    suggestions: review.findings.flatMap(finding => {
      const rewrite = finding.suggestedRewrite;
      if (!rewrite || rewrite.original === rewrite.revised || !isSafeAiRewrite(rewrite.original, rewrite.revised)) return [];
      return [{ finding_id: finding.id, original_text: rewrite.original, suggested_text: rewrite.revised, status: "pending" as const }];
    }),
  };
}
