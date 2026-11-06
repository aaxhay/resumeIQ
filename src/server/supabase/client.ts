import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfiguration } from "../../lib/config/supabase";
import { AccountError } from "./errors";

export function configuration() { return supabaseConfiguration(process.env); }
/** Request-scoped client using only a publishable key and the caller's verified session. */
export async function createSupabaseClient() {
  const config = configuration();
  if (!config) throw new AccountError("NOT_CONFIGURED", 503);
  const store = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => { for (const { name, value, options } of values) store.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" }); },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000) }) },
  });
}
export async function authenticatedClient() {
  const client = await createSupabaseClient();
  // Never authorize from getSession(), client-supplied IDs, or unverified cookie contents.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email || !data.user.email_confirmed_at) throw new AccountError("UNAUTHORIZED", 401);
  return { client, user: data.user };
}
