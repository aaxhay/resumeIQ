import { z } from "zod";
import { jobAnalysisSchema } from "../job-description/analysis-contracts.ts";

export const MAX_AI_TEXT = 30_000;
export const AREAS = ["summary", "structure", "clarity", "grammar", "experience", "achievements", "skills", "projects", "repetition", "readability"] as const;
const short = z.string().trim().min(1).max(500);
const prose = z.string().trim().min(1).max(1200);
const quote = z.string().min(1).max(2500);
const evidence = z.array(quote).max(3);
export const rewriteSchema = z.object({ original: quote, revised: quote }).strict();
export const reviewSchema = z.object({
  assessment: prose,
  priorities: z.array(z.object({ title: short, recommendation: prose, resumeEvidence: evidence.min(1) }).strict()).length(3),
  strengths: z.array(z.object({ title: short, explanation: prose, resumeEvidence: evidence.min(1) }).strict()).min(1).max(5),
  areas: z.array(z.object({ area: z.enum(AREAS), status: z.enum(["assessed", "not_assessed"]), explanation: short }).strict()).length(10),
  findings: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]{1,60}$/), area: z.enum(AREAS), impact: z.enum(["high", "medium", "low"]),
    issue: prose, whyItMatters: prose, recommendation: prose, resumeEvidence: evidence,
    suggestedRewrite: rewriteSchema.nullable(),
  }).strict()).max(12),
  jobMatches: z.array(z.object({
    category: z.enum(["required_skill", "preferred_skill", "experience", "responsibility", "technical_requirement", "qualification"]),
    requirement: short, jobEvidence: quote,
    status: z.enum(["supported", "partially_supported", "not_evidenced", "not_assessed"]),
    resumeEvidence: evidence, explanation: prose, recommendation: prose,
  }).strict()).max(20),
  limitations: z.array(short).min(1).max(5),
}).strict();
export type AiReview = z.infer<typeof reviewSchema>;
export type Rewrite = z.infer<typeof rewriteSchema>;
const text = z.string().trim().min(40).max(MAX_AI_TEXT).refine(value => value.split(/\s+/u).length >= 8, "Supply at least eight words.");
const common = { resumeText: text, confirmed: z.literal(true), consent: z.literal(true), synthetic: z.boolean(), requestId: z.uuid() };
export const reviewRequestSchema = z.discriminatedUnion("mode", [
  z.object({ ...common, mode: z.literal("general") }).strict(),
  z.object({ ...common, mode: z.literal("job-specific"), jobDescription: z.string().trim().min(50).max(10_000) }).strict(),
]);
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;
export const ERROR_CODES = ["INVALID_REQUEST", "NOT_CONFIGURED", "PRIVACY_GATE", "BUSY", "DUPLICATE", "RATE_LIMIT", "TIMEOUT", "CANCELLED", "INVALID_RESPONSE", "PROVIDER_ERROR"] as const;
export const VALIDATION_ISSUES = ["format", "coverage", "evidence", "rewrite", "unsupported_claim", "unverified_number", "job_claim", "output_limit", "blocked", "incomplete"] as const;
export type ValidationIssue = (typeof VALIDATION_ISSUES)[number];
export const reviewResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: reviewSchema, jobAnalysis: jobAnalysisSchema.nullable(), model: z.string(), redacted: z.boolean() }).strict(),
  z.object({ ok: z.literal(false), error: z.object({ code: z.enum(ERROR_CODES), message: z.string(), retryable: z.boolean(), validationIssue: z.enum(VALIDATION_ISSUES).optional() }).strict() }).strict(),
]);
export const availabilitySchema = z.object({ configured: z.boolean(), personalDataEnabled: z.boolean() }).strict();
