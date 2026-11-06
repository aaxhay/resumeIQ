import "server-only";
import { reviewRequestSchema, type ReviewRequest } from "../../lib/ai-review/contracts.ts";
import { AiError } from "./errors.ts";
const MAX_BODY_BYTES = 250_000;
export async function readReviewRequest(request: Request): Promise<ReviewRequest> {
  const expected = new URL(request.url);
  const host = request.headers.get("host"); if (host) expected.host = host;
  if (request.headers.get("origin") !== expected.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AiError("INVALID_REQUEST", "Submit AI reviews from this application.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json" || !request.body) throw new AiError("INVALID_REQUEST", "Send a JSON review request.", 400);
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new AiError("INVALID_REQUEST", "The analysis request is too large.", 413);
  const reader = request.body.getReader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const signal = AbortSignal.any([controller.signal, request.signal]);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new AiError("INVALID_REQUEST", "The analysis request is too large.", 413);
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    const parsed = reviewRequestSchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown);
    if (!parsed.success) throw new AiError("INVALID_REQUEST", "Confirm the resume, consent to provider processing, and supply valid text: resume 40–30,000 characters; job description 50–10,000 characters when required.", 400);
    return parsed.data;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("INVALID_REQUEST", signal.aborted ? "Reading the request was cancelled or timed out." : "The review request is malformed.", 400);
  } finally {
    clearTimeout(timeout); signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined); reader.releaseLock();
  }
}
