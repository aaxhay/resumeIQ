import "server-only";

export class JsonRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.name = "JsonRequestError"; this.status = status; }
}

/** Same-origin, bounded JSON reader shared by document and AI endpoints. */
export async function readJsonRequest(request: Request, maxBytes: number): Promise<unknown> {
  const expected = new URL(request.url);
  const host = request.headers.get("host");
  if (host) expected.host = host;
  if (request.headers.get("origin") !== expected.origin || request.headers.get("sec-fetch-site") === "cross-site") throw new JsonRequestError("Submit this request from this application.", 403);
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json" || !request.body) throw new JsonRequestError("Send a JSON request.");
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new JsonRequestError("The request is too large.", 413);
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
      if (size > maxBytes) throw new JsonRequestError("The request is too large.", 413);
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
  } catch (error) {
    if (error instanceof JsonRequestError) throw error;
    throw new JsonRequestError(signal.aborted ? "Reading the request was cancelled or timed out." : "The request is malformed.");
  } finally {
    clearTimeout(timeout); signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined); reader.releaseLock();
  }
}
