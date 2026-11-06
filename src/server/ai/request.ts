import "server-only";
import { reviewRequestSchema, type ReviewRequest } from "../../lib/ai-review/contracts.ts";
import { JsonRequestError, readJsonRequest } from "../http/json-request.ts";
import { AiError } from "./errors.ts";
const MAX_BODY_BYTES = 250_000;
export async function readReviewRequest(request: Request): Promise<ReviewRequest> {
  try {
    const parsed = reviewRequestSchema.safeParse(await readJsonRequest(request, MAX_BODY_BYTES));
    if (!parsed.success) throw new AiError("INVALID_REQUEST", "Confirm the resume, consent to provider processing, and supply valid text: resume 40–30,000 characters; job description 50–10,000 characters when required.", 400);
    return parsed.data;
  } catch (error) {
    if (error instanceof JsonRequestError) throw new AiError("INVALID_REQUEST", error.message, error.status);
    throw error;
  }
}
