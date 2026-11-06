import "server-only";
import { MAX_FILE_BYTES, MAX_RESUME_CHARACTERS } from "../../lib/resume/limits.ts";
import { pastedResumeSchema } from "../../lib/resume/contracts.ts";
import { ResumeProcessingError } from "./errors.ts";
import { validateDocument } from "./file-validation.ts";
import type { ProcessingInput } from "./types.ts";

/** Limit actual streamed bytes, not merely the untrusted Content-Length header. */
export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new ResumeProcessingError("INVALID_REQUEST", "Add a document or paste resume text.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 15_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (timedOut) throw new ResumeProcessingError("TIMEOUT", "The upload took too long. Please try again.");
      if (request.signal.aborted) throw new ResumeProcessingError("CANCELLED", "The upload was cancelled.");
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ResumeProcessingError("FILE_TOO_LARGE", "The request is too large. Choose one file up to 5 MB, or paste up to 80,000 characters.");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function parseExtractionRequest(request: Request): Promise<ProcessingInput> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" && mediaType !== "multipart/form-data") {
    throw new ResumeProcessingError("UNSUPPORTED_FORMAT", "Send a PDF/DOCX file or pasted resume text.");
  }
  const body = await readBoundedBody(request, mediaType === "application/json" ? MAX_RESUME_CHARACTERS * 6 + 1024 : MAX_FILE_BYTES + 64 * 1024);
  try {
    if (mediaType === "application/json") {
      const json: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
      const parsed = pastedResumeSchema.safeParse(json);
      if (!parsed.success) {
        if (parsed.error.issues.some((issue) => issue.code === "too_big")) throw new ResumeProcessingError("TEXT_TOO_LONG", "Keep resume text to 80,000 characters or fewer.");
        throw new ResumeProcessingError("INVALID_REQUEST", "Send a single text field containing your resume.");
      }
      return { kind: "pasted", text: parsed.data.text };
    }
    // Multipart parsing occurs only after the entire body has been bounded.
    const form = await new Response(Buffer.from(body), { headers: { "content-type": contentType } }).formData();
    const entries = Array.from(form.entries());
    const file = form.get("file");
    if (entries.length !== 1 || entries[0]?.[0] !== "file" || !(file instanceof File)) {
      throw new ResumeProcessingError("INVALID_REQUEST", "Upload exactly one file in the file field.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = validateDocument(bytes, file.name, file.type);
    return { kind, bytes };
  } catch (error: unknown) {
    if (error instanceof ResumeProcessingError) throw error;
    throw new ResumeProcessingError("INVALID_REQUEST", "We couldn’t read this request. Select your file again or paste your resume text.");
  }
}
