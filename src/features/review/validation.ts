import { z } from "zod";
import { validateFileMetadata, validateFileSignature, type FileCheck } from "@/lib/resume/file-validation";

export { MAX_FILE_BYTES, MAX_FILE_LABEL, FILE_ACCEPT } from "@/lib/resume/limits";
export { validateFileMetadata } from "@/lib/resume/file-validation";
export const MIN_JOB_CHARACTERS = 50;
export const MAX_JOB_CHARACTERS = 10_000;

const jobDescriptionSchema = z.string()
  .max(MAX_JOB_CHARACTERS, "Keep the job description to 10,000 characters or fewer.")
  .trim()
  .min(MIN_JOB_CHARACTERS, "Add at least 50 characters from the job description, including responsibilities or requirements.");

export const reviewSetupSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("general") }),
  z.object({ mode: z.literal("job-specific"), jobDescription: jobDescriptionSchema }),
]);

export function getJobDescriptionError(value: string): string | undefined {
  const result = jobDescriptionSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/** Convenience only; the server repeats checks and actually parses the document. */
export async function inspectResumeFile(file: File): Promise<FileCheck> {
  const metadata = validateFileMetadata({ name: file.name, size: file.size, type: file.type });
  if (!metadata.ok) return metadata;
  try {
    return validateFileSignature(new Uint8Array(await file.slice(0, 5).arrayBuffer()), metadata.kind);
  } catch {
    return { ok: false, code: "MALFORMED_FILE", message: "We couldn’t read this file. Try selecting it again or choose another file." };
  }
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
