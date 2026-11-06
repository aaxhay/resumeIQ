import { z } from "zod";

export const JOB_CATEGORIES = ["required_skill", "preferred_skill", "responsibility", "experience", "qualification", "technical_requirement"] as const;
export const jobEvidenceSchema = z.object({
  text: z.string().min(1).max(10_000),
  start: z.number().int().nonnegative(), end: z.number().int().nonnegative(),
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
}).strict();
export const jobFieldSchema = z.object({ value: z.string().min(1).max(1000), evidence: jobEvidenceSchema }).strict();
export const jobRequirementSchema = z.object({
  id: z.string().min(1).max(100), category: z.enum(JOB_CATEGORIES),
  requirement: z.string().min(1).max(2500), evidence: jobEvidenceSchema,
  source: z.enum(["explicit-heading", "explicit-wording"]),
}).strict();
export const jobProfileSchema = z.object({
  title: jobFieldSchema.nullable(), company: jobFieldSchema.nullable(),
  requirements: z.array(jobRequirementSchema).max(100),
  limitations: z.array(z.string().min(1).max(600)).min(1).max(10),
  truncated: z.boolean(),
}).strict();
export type JobProfile = z.infer<typeof jobProfileSchema>;
export type JobRequirement = z.infer<typeof jobRequirementSchema>;
export type JobEvidence = z.infer<typeof jobEvidenceSchema>;
