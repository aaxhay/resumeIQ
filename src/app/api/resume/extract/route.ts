import { parseExtractionRequest } from "@/server/resume-processing/request";
import { errorStatus, safeFailure, ResumeProcessingError } from "@/server/resume-processing/errors";
import { runWorker } from "@/server/resume-processing/run-worker";

export const runtime = "nodejs";
// Upload read (15s) + isolated parsing (15s), with platform overhead.
export const maxDuration = 45;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
let inFlight = 0;

export async function POST(request: Request): Promise<Response> {
  if (inFlight >= 4) return Response.json(safeFailure(new ResumeProcessingError("BUSY", "The upload service is busy. Please try again shortly.")), { status: 429, headers });
  inFlight += 1;
  try {
    const origin = request.headers.get("origin");
    // Next may normalize request.url to its bind hostname. The browser's
    // same-origin authority is the incoming Host (including the port).
    const expectedOrigin = new URL(request.url);
    const host = request.headers.get("host");
    if (host) expectedOrigin.host = host;
    if ((origin && origin !== expectedOrigin.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ResumeProcessingError("INVALID_REQUEST", "Submit your resume from this application.");
    }
    const input = await parseExtractionRequest(request);
    const result = await runWorker(input, request.signal);
    return Response.json(result, { status: result.ok ? 200 : errorStatus(result.error.code), headers });
  } catch (error: unknown) {
    const result = safeFailure(error);
    return Response.json(result, { status: errorStatus(result.error.code), headers });
  } finally {
    inFlight -= 1;
  }
}
