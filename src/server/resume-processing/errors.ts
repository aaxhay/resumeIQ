import type { ExtractionResponse, ResumeErrorCode } from "../../lib/resume/contracts.ts";

export class ResumeProcessingError extends Error {
  readonly code: ResumeErrorCode;
  constructor(code: ResumeErrorCode, message: string) {
    super(message);
    this.name = "ResumeProcessingError";
    this.code = code;
  }
}

export function safeFailure(error: unknown): Extract<ExtractionResponse, { ok: false }> {
  if (error instanceof ResumeProcessingError) return { ok: false, error: { code: error.code, message: error.message } };
  return { ok: false, error: { code: "PROCESSING_FAILED", message: "We couldn’t extract this document. Try a fresh PDF or DOCX, or paste your resume text instead. This is a processing problem, not a judgment of your resume." } };
}

export function errorStatus(code: ResumeErrorCode): number {
  if (code === "FILE_TOO_LARGE" || code === "TEXT_TOO_LONG") return 413;
  if (code === "UNSUPPORTED_FORMAT") return 415;
  if (code === "INVALID_REQUEST") return 400;
  if (code === "TIMEOUT") return 504;
  if (code === "BUSY") return 429;
  if (code === "PROCESSING_FAILED") return 500;
  if (code === "CANCELLED") return 408;
  return 422;
}
