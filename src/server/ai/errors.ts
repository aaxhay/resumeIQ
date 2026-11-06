import type { ERROR_CODES } from "../../lib/ai-review/contracts.ts";
export type AiErrorCode = (typeof ERROR_CODES)[number];
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  constructor(code: AiErrorCode, message: string, status: number, retryable = false) {
    super(message); this.code = code; this.status = status; this.retryable = retryable;
  }
}
export function invalidResponse(reason = "unspecified"): AiError {
  const error = new AiError("INVALID_RESPONSE", "Gemini returned feedback that failed structure or evidence validation. Nothing was displayed. Review the supplied text and retry; no changes have been applied.", 502, true);
  // Static diagnostic labels only, never input, output, Zod values, or SDK errors.
  error.cause = reason;
  return error;
}
export function safeAiFailure(error: unknown) {
  const known = error instanceof AiError ? error : new AiError("PROVIDER_ERROR", "AI analysis could not be completed. Your text has not been changed. Try again later.", 502, true);
  return { status: known.status, body: { ok: false as const, error: { code: known.code, message: known.message, retryable: known.retryable } } };
}
