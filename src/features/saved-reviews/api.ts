import { z } from "zod";
import { historyErrorSchema, type HistoryErrorCode } from "@/lib/saved-reviews/contracts";

const messages: Record<HistoryErrorCode, string> = {
  NOT_CONFIGURED: "Accounts and saving are unavailable on this deployment. You can still review anonymously.",
  HISTORY_DISABLED: "Saving is unavailable on this deployment. Your current review and local draft are unchanged.",
  HISTORY_NOT_READY: "Saved history requires database setup. The operator must apply the Supabase migration and configure retention using docs/supabase.md. Your review and draft are unchanged; retrying cannot fix missing tables.",
  UNAUTHORIZED: "Your session has expired. Private history has been cleared from this page. Sign in again to continue.",
  INVALID_REQUEST: "Check the form and consent before trying again. Nothing new was confirmed saved.",
  AUTH_FAILED: "We could not complete account access. Check your email and password, confirm your email if needed, then try again.",
  BUSY: "This service is busy. Wait a moment, then try again.",
  STORAGE_ERROR: "Saved history could not be updated or loaded. Please try again.",
  NOT_FOUND: "This summary is no longer available. Refresh your history to see the current list.",
};
export class AccountRequestError extends Error {
  constructor(public code: HistoryErrorCode) { super(messages[code]); }
}
export function requestError(error: unknown) {
  return error instanceof AccountRequestError ? error.message : "The request could not be confirmed. Check your connection and try again. A save may have completed; retrying the same save will not create a duplicate.";
}
export function unauthorized(error: unknown) { return error instanceof AccountRequestError && error.code === "UNAUTHORIZED"; }

export async function accountRequest<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, signal, cache: "no-store", credentials: "same-origin",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (response.status === 401) throw new AccountRequestError("UNAUTHORIZED");
  const payload: unknown = await response.json();
  if (!response.ok) {
    const parsed = historyErrorSchema.safeParse(payload);
    throw new AccountRequestError(parsed.success ? parsed.data.error.code : "STORAGE_ERROR");
  }
  return schema.parse(payload);
}
