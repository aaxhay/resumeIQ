import "server-only";
import { historyErrorSchema, type HistoryErrorCode } from "../../lib/saved-reviews/contracts";

export class AccountError extends Error {
  readonly code: HistoryErrorCode;
  readonly status: number;
  constructor(code: HistoryErrorCode, status: number) { super(code); this.name = "AccountError"; this.code = code; this.status = status; }
}
/** Static Postgres/PostgREST codes only; never expose remote messages or schema details. */
export function historySetupMissing(error: { code?: string }): boolean {
  return ["PGRST205", "PGRST202", "42P01", "42883", "PGRST200"].includes(error.code ?? "");
}
export function historyStorageError(error: { code?: string; message?: string }): AccountError {
  // The existing migration uses 23514 for several constraints. Match only its exact
  // review-cap marker; never classify arbitrary constraint errors as quota failures.
  if (error.code === "23514" && error.message === "Saved review limit reached") return new AccountError("REVIEW_LIMIT", 409);
  return new AccountError(historySetupMissing(error) ? "HISTORY_NOT_READY" : "STORAGE_ERROR", 503);
}
export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
export function accountFailure(error: unknown): Response {
  const known = error instanceof AccountError ? error : new AccountError("STORAGE_ERROR", 503);
  return Response.json(historyErrorSchema.parse({ ok: false, error: { code: known.code, message: known.code === "HISTORY_NOT_READY" ? "Saved history requires database setup. The operator must apply the ResumeIQ Supabase migration and configure retention. Your local review is unchanged." : "The optional account or saved-history operation could not be completed. Your local review is unchanged." } }), { status: known.status, headers: { ...privateHeaders, ...(known.status === 429 ? { "Retry-After": "60" } : {}) } });
}
