import { z } from "zod";
import { JOB_CATEGORIES, jobProfileSchema } from "./contracts.ts";

export const jobComparisonSchema = z.object({
  id: z.string().min(1).max(120),
  category: z.enum(JOB_CATEGORIES),
  requirement: z.string().min(1).max(2500),
  jobEvidence: z.string().min(1).max(10_000),
  status: z.enum(["supported", "partially_supported", "not_evidenced", "not_assessed"]),
  resumeEvidence: z.array(z.string().min(1).max(2500)).max(3),
  explanation: z.string().min(1).max(1200),
  recommendation: z.string().min(1).max(1200),
  source: z.enum(["validated-ai", "unassessed-extraction"]),
}).strict();
export const jobAnalysisSchema = z.object({
  profile: jobProfileSchema,
  comparisons: z.array(jobComparisonSchema).max(120),
}).strict();
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;
export type JobComparison = z.infer<typeof jobComparisonSchema>;
