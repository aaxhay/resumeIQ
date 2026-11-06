import { z } from "zod";
import { MAX_RESUME_CHARACTERS } from "../resume/limits.ts";

export const ANALYSIS_VERSION = "1.0.0";
export const analysisTextSchema = z.string().max(MAX_RESUME_CHARACTERS)
  .refine((text) => text.trim().length > 0, "Supply nonempty normalized resume text.")
  .refine((text) => !text.includes("\r"), "Normalize line endings to LF before analysis.");
export const analysisOptionsSchema = z.object({ projectsRelevant: z.boolean().optional() }).strict();
export type AnalysisOptions = z.infer<typeof analysisOptionsSchema>;

export const findingSchema = z.object({
  id: z.string(),
  rule_id: z.string(),
  category: z.enum(["structure", "writing", "achievement", "readability"]),
  severity: z.enum(["warning", "info"]),
  kind: z.enum(["objective", "suggestion"]),
  title: z.string(),
  description: z.string(),
  evidence_text: z.string(),
  evidence_location: z.object({
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
    start_offset: z.number().int().nonnegative(),
    end_offset: z.number().int().nonnegative(),
  }).optional(),
  recommendation: z.string(),
  detection_source: z.literal("deterministic"),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ResumeFinding = z.infer<typeof findingSchema>;
export type FindingDetails = Pick<ResumeFinding, "rule_id" | "category" | "severity" | "kind" | "title" | "description" | "recommendation" | "confidence">;

/** UTF-16 offsets refer to the exact supplied text; end is exclusive. Lines are 1-based. */
export type TextSpan = { start: number; end: number; startLine: number; endLine: number };
export type TextLine = TextSpan & { text: string; number: number };
export type SectionKind = "experience" | "education" | "skills" | "projects" | "summary" | "other";
export type Section = { kinds: SectionKind[]; heading: TextLine; lines: TextLine[] };
export type TextBlock = TextSpan & { text: string; section?: SectionKind; marker?: string };
export type AnalysisContext = {
  text: string;
  lines: TextLine[];
  sections: Section[];
  bullets: TextBlock[];
  paragraphs: TextBlock[];
  options: AnalysisOptions;
};
export type AnalysisRule = (context: AnalysisContext) => ResumeFinding[];
