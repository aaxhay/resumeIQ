import { analysisOptionsSchema, analysisTextSchema, type AnalysisOptions, type ResumeFinding } from "./contracts.ts";
import { makeFinding } from "./evidence.ts";
import { parseResume } from "./parse.ts";
import { STRUCTURE_RULES } from "./structure.ts";
import { WRITING_RULES } from "./writing.ts";
import { ACHIEVEMENT_RULES } from "./achievement.ts";
import { READABILITY_RULES } from "./readability.ts";

export { ANALYSIS_VERSION, findingSchema } from "./contracts.ts";
export type { AnalysisOptions, ResumeFinding } from "./contracts.ts";
export const MAX_FINDINGS = 200;

/** Pure, synchronous, no I/O, dates, random IDs, model/provider calls, or scoring.
 * Input must use normalized LF line endings. Evidence points to that exact input.
 * Throws a ZodError for empty, oversized, or malformed inputs/options.
 */
export function analyzeResume(text: string, options: AnalysisOptions = {}): ResumeFinding[] {
  const context = parseResume(analysisTextSchema.parse(text), analysisOptionsSchema.parse(options));
  const findings = [...STRUCTURE_RULES, ...WRITING_RULES, ...ACHIEVEMENT_RULES, ...READABILITY_RULES].flatMap((rule) => rule(context));
  // Fixed category/rule order; rules use source order or documented deterministic
  // phrase grouping. No locale-dependent sorting or severity-based scoring.
  if (findings.length <= MAX_FINDINGS) return findings;
  return [...findings.slice(0, MAX_FINDINGS - 1), makeFinding(context, {
    rule_id: "analysis.finding-limit", category: "readability", severity: "info", kind: "objective", confidence: "high",
    title: "Finding display limit reached",
    description: `The analyzer produced ${findings.length} findings. Only the first ${MAX_FINDINGS - 1} are returned, followed by this notice. This limit keeps the result manageable; it is not a resume-quality score.`,
    recommendation: "Address repeated patterns or analyze a shorter relevant excerpt. The omitted findings have not been represented as passing checks.",
  })];
}
