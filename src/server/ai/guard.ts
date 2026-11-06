import "server-only";
import { createHash } from "node:crypto";
import { AiError } from "./errors.ts";

/** Local process safety caps, not distributed abuse protection or a billing guarantee.
 * Only hashes/timestamps are retained, never documents or output. */
export function createReviewGuard(now: () => number = Date.now) {
  const active = new Set<string>();
  const requests = new Map<string, number>();
  const recent = new Map<string, number>();
  let minuteStart = now(); let minuteCount = 0; let dayStart = now(); let dayCount = 0;
  return function acquire(requestId: string, input: string): () => void {
    const time = now();
    for (const [key, expires] of requests) if (expires <= time) requests.delete(key);
    for (const [key, expires] of recent) if (expires <= time) recent.delete(key);
    const hash = createHash("sha256").update(input).digest("hex");
    if (requests.has(requestId) || active.has(hash) || recent.has(hash)) throw new AiError("DUPLICATE", "This review is already running or was just submitted. Wait at least thirty seconds before explicitly retrying.", 409, true);
    if (active.size >= 2) throw new AiError("BUSY", "AI review is busy. Please retry shortly.", 429, true);
    if (time - minuteStart >= 60_000) { minuteStart = time; minuteCount = 0; }
    if (time - dayStart >= 86_400_000) { dayStart = time; dayCount = 0; }
    if (minuteCount >= 10 || dayCount >= 100) throw new AiError("RATE_LIMIT", "This server's local AI request allowance is exhausted. Retry later; daily limits may require waiting until the allowance resets.", 429, true);
    minuteCount++; dayCount++; active.add(hash); requests.set(requestId, time + 300_000);
    let released = false;
    return () => { if (!released) { released = true; active.delete(hash); recent.set(hash, now() + 30_000); } };
  };
}
export const acquireReview = createReviewGuard();
