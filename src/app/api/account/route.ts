import { accountActionResponseSchema, accountActionSchema, accountSchema } from "@/lib/saved-reviews/contracts";
import { configuration, createSupabaseClient } from "@/server/supabase/client";
import { AccountError, accountFailure, privateHeaders, historySetupMissing } from "@/server/supabase/errors";
import { acquireAccountOperation } from "@/server/supabase/guard";
import { JsonRequestError, readJsonRequest } from "@/server/http/json-request";

export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    const config = configuration();
    if (!config) return Response.json(accountSchema.parse({ ok: true, configured: false, historyEnabled: false, user: null }), { headers: privateHeaders });
    release = acquireAccountOperation("read");
    const client = await createSupabaseClient();
    const { data, error } = await client.auth.getUser();
    const user = !error && data.user && !data.user.is_anonymous && data.user.email_confirmed_at && data.user.email ? { email: data.user.email } : null;
    let setupRequired = false;
    let historyUnavailable = false;
    if (user && config.historyEnabled) {
      // History availability must not remove verified identity or access to sign-out.
      try {
        // Empty, authorized query validates table/relationship availability without fetching content.
        const readiness = await client.from("resume_reviews").select("id,resume_suggestions(id)").limit(0);
        if (readiness.error) {
          if (historySetupMissing(readiness.error)) setupRequired = true;
          else historyUnavailable = true;
        }
      } catch { historyUnavailable = true; }
    }
    return Response.json(accountSchema.parse({ ok: true, configured: true, historyEnabled: config.historyEnabled && !setupRequired && !historyUnavailable, ...(setupRequired ? { historySetupRequired: true } : {}), ...(historyUnavailable ? { historyUnavailable: true } : {}), user }), { headers: privateHeaders });
  } catch (error) { return accountFailure(error); } finally { release?.(); }
}
export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    const parsed = accountActionSchema.safeParse(await readJsonRequest(request, 16_384));
    if (!parsed.success) throw new AccountError("INVALID_REQUEST", 400);
    release = acquireAccountOperation("auth");
    const client = await createSupabaseClient();
    const input = parsed.data;
    let confirmationRequired = false;
    if (input.action === "sign-in") {
      const { data, error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
      if (error || !data.session || !data.user || data.user.is_anonymous) throw new AccountError("AUTH_FAILED", 400);
    } else if (input.action === "sign-up") {
      // Origin was checked by readJsonRequest; never accept an arbitrary redirect from the client.
      const redirect = new URL("/auth/callback", request.headers.get("origin")!).href;
      const { data, error } = await client.auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: redirect } });
      if (error) throw new AccountError("AUTH_FAILED", 400);
      confirmationRequired = !data.session;
    } else {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw new AccountError("AUTH_FAILED", 400);
    }
    return Response.json(accountActionResponseSchema.parse({ ok: true, confirmationRequired }), { headers: privateHeaders });
  } catch (error) { return accountFailure(error instanceof JsonRequestError ? new AccountError("INVALID_REQUEST", error.status) : error); }
  finally { release?.(); }
}
