import "server-only";
import { configuration, authenticatedClient } from "./client";
import { AccountError, historyStorageError } from "./errors";
import { historyListSchema, saveReviewRequestSchema, savedResponseSchema, type SaveReviewRequest } from "../../lib/saved-reviews/contracts";

export function requireHistoryEnabled() {
  const config = configuration();
  if (!config) throw new AccountError("NOT_CONFIGURED", 503);
  if (!config.historyEnabled) throw new AccountError("HISTORY_DISABLED", 503);
}
const selectedFields = "id,review_mode,resume_filename,analysis_result,created_at,resume_suggestions(finding_id,original_text,suggested_text,status)";
export async function listSavedReviews() {
  requireHistoryEnabled();
  const { client, user } = await authenticatedClient();
  const { data, error } = await client.from("resume_reviews").select(selectedFields).eq("user_id", user.id).gt("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).order("created_at", { ascending: false }).limit(20);
  if (error) throw historyStorageError(error);
  const parsed = historyListSchema.safeParse({ ok: true, reviews: data });
  if (!parsed.success) throw new AccountError("STORAGE_ERROR", 503);
  return parsed.data;
}
export async function saveReview(input: SaveReviewRequest) {
  requireHistoryEnabled();
  const value = saveReviewRequestSchema.parse(input);
  const serialized = JSON.stringify(value);
  // Reject common credential forms and configured secrets, not merely unknown field names.
  // Not a universal secret detector: UI also warns users never to save credentials.
  const credentials = /AIza[0-9A-Za-z_-]{35}|sb_secret_[A-Za-z0-9_-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}/u;
  const configuredSecrets = [process.env.GEMINI_API_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY].filter((secret): secret is string => Boolean(secret && secret.length >= 12));
  if (credentials.test(serialized) || configuredSecrets.some(secret => serialized.includes(secret))) throw new AccountError("INVALID_REQUEST", 400);
  const { client, user } = await authenticatedClient();
  // Consent is bound to the displayed account. This comparison never supplies ownership:
  // the invoker RPC still derives its owner exclusively from the verified session's auth.uid().
  if (value.expected_account_email !== user.email) throw new AccountError("ACCOUNT_CHANGED", 409);
  const { data, error } = await client.rpc("save_resume_review", {
    p_id: value.id, p_review_mode: value.review_mode, p_resume_filename: value.resume_filename,
    p_analysis_result: value.analysis_result, p_suggestions: value.suggestions,
  });
  if (error) throw historyStorageError(error);
  const parsed = savedResponseSchema.safeParse({ ok: true, id: data });
  if (!parsed.success || parsed.data.id !== value.id) throw new AccountError("STORAGE_ERROR", 503);
  return parsed.data;
}
export async function deleteSavedReview(id: string) {
  requireHistoryEnabled();
  const { client, user } = await authenticatedClient();
  const { data, error } = await client.from("resume_reviews").delete().eq("user_id", user.id).eq("id", id).select("id").maybeSingle();
  if (error) throw historyStorageError(error);
  if (!data || data.id !== id) throw new AccountError("NOT_FOUND", 404);
  return { ok: true as const };
}
