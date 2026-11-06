import { createSupabaseClient } from "@/server/supabase/client";
import { acquireAccountOperation } from "@/server/supabase/guard";
import { privateHeaders } from "@/server/supabase/errors";

export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  const destination = new URL("/account", request.url);
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (!code || code.length > 2048) throw new Error("Invalid confirmation code");
    release = acquireAccountOperation("auth");
    const client = await createSupabaseClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new Error("Confirmation failed");
  } catch { destination.searchParams.set("auth", "failed"); }
  finally { release?.(); }
  // Fixed application destination; no client-supplied next/redirect parameter is honored.
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: destination.pathname + destination.search } });
}
