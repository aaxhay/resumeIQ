import { z } from "zod";
import { MAX_RESUME_CHARACTERS, MIN_RESUME_CHARACTERS, MIN_RESUME_WORDS } from "./limits.ts";

export const resumeSourceSchema = z.enum(["pdf", "docx", "pasted"]);
export type ResumeSource = z.infer<typeof resumeSourceSchema>;

export const warningSchema = z.object({
  code: z.enum(["layout", "low-text", "partial", "conversion"]),
  message: z.string().max(500),
});
export type ExtractionWarning = z.infer<typeof warningSchema>;

export const errorCodeSchema = z.enum([
  "INVALID_REQUEST", "UNSUPPORTED_FORMAT", "FILE_TOO_LARGE", "MALFORMED_FILE",
  "PROTECTED_FILE", "EMPTY_TEXT", "INSUFFICIENT_TEXT", "TEXT_TOO_LONG",
  "RESOURCE_LIMIT", "TIMEOUT", "BUSY", "CANCELLED", "PROCESSING_FAILED",
]);
export type ResumeErrorCode = z.infer<typeof errorCodeSchema>;

export const resumeTextSchema = z.string().max(MAX_RESUME_CHARACTERS, "Keep resume text to 80,000 characters or fewer.")
  .refine((text) => text.trim().length >= MIN_RESUME_CHARACTERS && text.trim().split(/\s+/u).length >= MIN_RESUME_WORDS && (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 20, {
    message: "Add at least 40 characters and 8 words of readable resume content before confirming.",
  });

export const pastedResumeSchema = z.object({ text: z.string().max(MAX_RESUME_CHARACTERS) }).strict();

export const extractionResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.object({
      source: resumeSourceSchema,
      text: z.string().max(MAX_RESUME_CHARACTERS),
      warnings: z.array(warningSchema).max(10),
      stats: z.object({ characters: z.number().int().nonnegative(), words: z.number().int().nonnegative(), pages: z.number().int().positive().optional() }),
    }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ code: errorCodeSchema, message: z.string().max(500) }) }),
]);
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type ExtractionResult = Extract<ExtractionResponse, { ok: true }>["data"];
