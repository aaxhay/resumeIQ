import { saveReviewRequestSchema } from "@/lib/saved-reviews/contracts";
import { JsonRequestError, readJsonRequest } from "@/server/http/json-request";
import { AccountError, accountFailure, privateHeaders } from "@/server/supabase/errors";
import { acquireAccountOperation } from "@/server/supabase/guard";
import { listSavedReviews, saveReview } from "@/server/supabase/history";

export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    release = acquireAccountOperation("read");
    return Response.json(await listSavedReviews(), { headers: privateHeaders });
  } catch (error) { return accountFailure(error); }
  finally { release?.(); }
}
export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    release = acquireAccountOperation("write");
    const parsed = saveReviewRequestSchema.safeParse(await readJsonRequest(request, 400_000));
    if (!parsed.success) throw new AccountError("INVALID_REQUEST", 400);
    return Response.json(await saveReview(parsed.data), { headers: privateHeaders });
  } catch (error) { return accountFailure(error instanceof JsonRequestError ? new AccountError("INVALID_REQUEST", error.status) : error); }
  finally { release?.(); }
}
