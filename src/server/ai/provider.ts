import type { AiReview, Rewrite } from "../../lib/ai-review/contracts.ts";

/** Application-facing boundary: no vendor SDK types. Inputs are already minimized. */
export interface ResumeAiProvider {
  readonly model: string;
  analyzeResume(resumeText: string, signal?: AbortSignal): Promise<AiReview>;
  analyzeJobMatch(resumeText: string, jobDescription: string, signal?: AbortSignal): Promise<AiReview>;
  rewriteResumeBullet(bullet: string, signal?: AbortSignal): Promise<Rewrite>;
}
