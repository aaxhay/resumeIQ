import "server-only";
import { historyErrorSchema, type HistoryErrorCode } from "../../lib/saved-reviews/contracts";

export class AccountError extends Error {
  readonly code: HistoryErrorCode;
  readonly status: number;
  constructor(code: HistoryErrorCode, status: number) { super(code); this.name = "AccountError"; this.code = code; this.status = status; }
}
export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
export function accountFailure(error: unknown): Response {
  const known = error instanceof AccountError ? error : new AccountError("STORAGE_ERROR", 503);
  return Response.json(historyErrorSchema.parse({ ok: false, error: { code: known.code, message: "The optional account or saved-history operation could not be completed. Your local review is unchanged." } }), { status: known.status, headers: { ...privateHeaders, ...(known.status === 429 ? { "Retry-After": "60" } : {}) } });
}
