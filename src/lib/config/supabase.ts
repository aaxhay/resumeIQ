import { z } from "zod";

const configuration = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().pipe(z.string().refine(value => {
    const url = new URL(value);
    return !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  })),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[A-Za-z0-9_-]{16,}$/u),
  SUPABASE_HISTORY_ENABLED: z.enum(["true", "false"]).optional().default("false"),
});
/** Accept only publishable keys, never secret/service-role keys. Values never appear in errors. */
export function supabaseConfiguration(input: unknown) {
  const parsed = configuration.safeParse(input);
  if (!parsed.success) return null;
  return { url: parsed.data.NEXT_PUBLIC_SUPABASE_URL, publishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, historyEnabled: parsed.data.SUPABASE_HISTORY_ENABLED === "true" };
}
