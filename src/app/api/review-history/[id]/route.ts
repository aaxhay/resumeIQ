import { z } from "zod";
import { deletedResponseSchema } from "@/lib/saved-reviews/contracts";
import { JsonRequestError, readJsonRequest } from "@/server/http/json-request";
import { AccountError, accountFailure, privateHeaders } from "@/server/supabase/errors";
import { acquireAccountOperation } from "@/server/supabase/guard";
import { deleteSavedReview } from "@/server/supabase/history";

export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    release = acquireAccountOperation("write");
    // Explicit empty JSON contract provides the same bounded, same-origin write checks as save/auth.
    const body = z.object({}).strict().safeParse(await readJsonRequest(request, 1024));
    const id = z.uuid().safeParse((await context.params).id);
    if (!body.success || !id.success) throw new AccountError("INVALID_REQUEST", 400);
    return Response.json(deletedResponseSchema.parse(await deleteSavedReview(id.data)), { headers: privateHeaders });
  } catch (error) { return accountFailure(error instanceof JsonRequestError ? new AccountError("INVALID_REQUEST", error.status) : error); }
  finally { release?.(); }
}
