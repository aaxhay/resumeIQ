import { DOCX_CONTENT_TYPE, EXPORT_FILENAME, exportRequestSchema, exportFailureSchema, MAX_EXPORT_TEXT } from "@/lib/resume-export/contracts";
import { generateResumeDocx } from "@/server/documents/generate-resume-docx";
import { ResumeExportError } from "@/server/documents/errors";
import { JsonRequestError, readJsonRequest } from "@/server/http/json-request";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
// Process-local resource bounds, not authentication or distributed abuse protection.
let active = 0;
let starts: number[] = [];
const failure = (code: "INVALID_REQUEST" | "BUSY" | "GENERATION_FAILED" | "INVALID_DOCUMENT", message: string, status: number) => Response.json(exportFailureSchema.parse({ ok: false, error: { code, message } }), { status, headers: { ...headers, ...(status === 429 ? { "Retry-After": "60" } : {}) } });

export async function POST(request: Request): Promise<Response> {
  const now = Date.now();
  starts = starts.filter(start => now - start < 60_000);
  if (active >= 2 || starts.length >= 20) return failure("BUSY", "Document export is busy. Wait a moment and try again.", 429);
  active++;
  try {
    // Six bytes covers JSON's escaped representation of each UTF-16 code unit.
    const input = exportRequestSchema.safeParse(await readJsonRequest(request, MAX_EXPORT_TEXT * 6 + 1024));
    if (!input.success) return failure("INVALID_REQUEST", "Supply a nonempty improved resume within the export limits. Unsupported control characters cannot be exported.", 400);
    starts.push(Date.now());
    request.signal.throwIfAborted();
    const bytes = await generateResumeDocx(input.data.text);
    request.signal.throwIfAborted();
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": DOCX_CONTENT_TYPE, "Content-Disposition": `attachment; filename="${EXPORT_FILENAME}"`, "Content-Length": String(bytes.length) } });
  } catch (error) {
    if (error instanceof JsonRequestError) return failure("INVALID_REQUEST", error.message, error.status);
    if (request.signal.aborted) return failure("INVALID_REQUEST", "The export request was cancelled. Your draft is unchanged.", 400);
    if (error instanceof ResumeExportError) return failure(error.code, "The document could not be generated and verified. Review your draft and try again; no changes were applied.", error.code === "INVALID_REQUEST" ? 400 : 500);
    return failure("GENERATION_FAILED", "The document could not be generated. Your draft is unchanged. Try again when ready.", 500);
  } finally { active--; }
}
