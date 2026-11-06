import { z } from "zod";

export const MAX_ORIGINAL_TEXT = 80_000;
export const MAX_SUGGESTIONS = 12;
export const MAX_EDIT_TEXT = 2_500;
export const MAX_ACCEPTED_EDITS = 12;
export const MAX_TARGETS = 200;
const offset = z.number().int().min(0).max(MAX_ORIGINAL_TEXT);
const id = z.string().regex(/^[a-z0-9-]{1,60}$/u);
const editText = z.string().min(1).max(MAX_EDIT_TEXT).refine(text => text.trim().length > 0);

/** Offsets are UTF-16 code units in the immutable ORIGINAL, never in the preview. */
export const targetSchema = z.object({
  start: offset,
  end: offset,
  line: z.number().int().min(1).max(MAX_ORIGINAL_TEXT + 1),
  context: z.string().max(180),
}).strict().refine(target => target.end > target.start).readonly();
export const suggestionSchema = z.object({
  id,
  findingId: id,
  originalText: editText,
  suggestedText: editText,
  reason: z.string().min(1).max(2_402),
  evidence: z.object({
    quote: editText,
    previewStart: offset,
    previewEnd: offset,
  }).strict().readonly(),
  status: z.enum(["pending", "accepted", "rejected", "manually_edited"]),
  hasAiRewrite: z.boolean(),
  safetyNote: z.string().min(1).max(300).nullable(),
  targets: z.array(targetSchema).max(MAX_TARGETS).readonly(),
  targetLimitExceeded: z.boolean(),
  target: targetSchema.nullable(),
}).strict().readonly();
export const acceptedEditSchema = z.object({
  suggestionId: id,
  start: offset,
  end: offset,
  originalText: editText,
  replacementText: editText,
  previousSuggestion: suggestionSchema,
}).strict().readonly();
export const improvementSessionSchema = z.object({
  originalText: z.string().min(1).max(MAX_ORIGINAL_TEXT),
  modifiedText: z.string().min(1).max(MAX_ORIGINAL_TEXT + MAX_ACCEPTED_EDITS * MAX_EDIT_TEXT),
  suggestions: z.array(suggestionSchema).max(MAX_SUGGESTIONS).readonly(),
  history: z.array(acceptedEditSchema).max(MAX_ACCEPTED_EDITS).readonly(),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  skippedFindings: z.array(z.object({
    findingId: id,
    reason: z.string().min(1).max(200),
  }).strict().readonly()).max(MAX_SUGGESTIONS).readonly(),
}).strict().readonly();

export type ImprovementTarget = z.infer<typeof targetSchema>;
export type ImprovementSuggestion = z.infer<typeof suggestionSchema>;
export type AcceptedEdit = z.infer<typeof acceptedEditSchema>;
export type ImprovementSession = z.infer<typeof improvementSessionSchema>;
export type ImprovementResult =
  | { readonly ok: true; readonly state: ImprovementSession }
  | { readonly ok: false; readonly error: string };
export type Applicability = { readonly canAccept: boolean; readonly reason: string | null };
