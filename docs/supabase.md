# Optional accounts and saved review summaries

The complete anonymous upload → confirmation → review → controlled improvement → DOCX workflow remains independent of Supabase. An account is optional and never required before a first review. No Supabase Storage bucket or persistent resume-file storage is implemented.

## What is implemented

- `/account`: optional Supabase email/password sign-in and signup, read-only saved summaries, explicit confirmed deletion, and sign-out.
- An initially collapsed **Save review summary** panel after validated AI feedback. Inline authentication avoids leaving the live draft. Nothing saves automatically; the user previews exactly what will be stored and gives separate storage consent.
- Snapshots include assessment, three priorities, strengths, limitations, and at most 12 conservative original/suggested rewrite excerpts. Excerpts can contain personal information. The application saves no filename from this UI.
- Full resume text, uploaded files, job descriptions, complete provider JSON, provider credentials, edited drafts, and local edit history are not persisted. Saved suggestions describe initial AI recommendations (`pending`), not later acceptance or manual decisions. Saved summaries cannot resume editing or regenerate a DOCX.
- At most 20 unexpired summaries per user, visible for 30 days from creation. Delete older summaries to make room. Saves are atomic; retrying the same owned snapshot UUID is idempotent. Snapshots cannot be updated through the application.

## Operator setup — required before enabling history

The configured URL and publishable key reached the hosted Auth settings endpoint successfully on 2026-11-06 (HTTP 200, email enabled, signup enabled). The `profiles` and `resume_reviews` probes returned HTTP 404 / `PGRST205`: the required schema was absent. **No hosted migration, retention job, test account, email, or storage bucket was created by this implementation.** A publishable key cannot provision SQL objects.

1. In the intended existing Supabase project, review `supabase/migrations/202611060001_saved_review_snapshots.sql`. Check that these table/function names do not collide with existing objects. Use the project's SQL Editor as an authorized administrator to apply the migration once. It is transactional, deliberately not an overwrite/recreation script. Keep a migration record; do not rerun blindly.
2. Review `supabase/retention.sql`. Its executable schedule is deliberately commented out. Install/enable Supabase Cron (`pg_cron`) if available, then explicitly install the documented hourly cleanup schedule, or configure an equivalent privileged scheduler. Verify the job succeeds and monitor subsequent runs. **Expiry policies hide data but are not physical deletion.** Do not enable persistence without an operational cleanup mechanism.
3. Set the Auth Site URL and redirect allowlist to your exact application origins and `/auth/callback` URLs (for example `http://localhost:3000/auth/callback` for local work). Do not use broad production wildcards. Keep email confirmation enabled. Configure production SMTP, Supabase Auth rate controls, and password protections before public use. Confirmation uses PKCE cookies: open the link in the same browser that initiated signup; otherwise confirm the email and return to sign in, or request a fresh link. Do not paste tokens or passwords into chat.
4. In ignored `.env.local` or the hosting environment, preserve existing Gemini settings and configure:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   SUPABASE_HISTORY_ENABLED=false
   ```

   Use a current `sb_publishable_...` key, not a legacy anon JWT, secret key, or service-role key. The publishable key is public by design; this application nevertheless uses the SDK only on the server. No privileged key is needed by the application. Never put a secret/service-role key in any `NEXT_PUBLIC_*` variable.
5. After schema and cleanup verification, explicitly set `SUPABASE_HISTORY_ENABLED=true` and restart the application. Without this flag history stays disabled; invalid/missing configuration leaves anonymous review operational. A flag is an operator assertion, not automatic migration or cleanup verification.
6. Using authorized synthetic test identities, verify signup/confirmation/sign-in, save/list/delete, two-user isolation, expired-row cleanup, and sign-out against the hosted project before calling the hosted feature ready. These live authenticated checks remain pending here. Test only synthetic content until the project's privacy/retention and deployment settings have been reviewed.

## Troubleshooting: history is not saved

A fresh metadata-only probe on **2026-11-07** found `SUPABASE_HISTORY_ENABLED=true`, but all three required tables (`profiles`, `resume_reviews`, `resume_suggestions`) still returned HTTP 404 / `PGRST205`. No database connection was configured for applying SQL. **Turning on the flag does not create the schema.** Complete steps 1–2 above before enabling history, then verify the authenticated flow. No hosted SQL or retention job was applied during this follow-up.

For a verified signed-in user with the flag enabled, `/api/account` now performs a zero-row table/relationship readiness query. Missing schema disables the save UI and returns `historySetupRequired: true` while retaining identity/sign-out. Missing tables, relationships, or save RPCs encountered during history operations return the safe `HISTORY_NOT_READY` code rather than a generic failure. Other readiness failures return `historyUnavailable: true`, disable only history, and retain verified identity/sign-out with a separate availability retry. Other history-operation database failures remain `STORAGE_ERROR`; raw SQL diagnostics are not exposed. The migration's exact twenty-summary quota marker returns `REVIEW_LIMIT` with deletion guidance rather than a transient retry message. This readiness check does **not** verify Cron, backup retention, every database object, or live cross-user isolation. Those remain operator checks. Once setup is complete, return from another tab to trigger account revalidation or reload the account page; preserve or download local work before any full review-page reload.

Downloading DOCX never automatically persists a summary. Return from the completion screen, open **Save review summary**, sign in, inspect the preview, and give storage consent. Account history opens in a new tab so it does not discard the review draft.

## Schema and ownership

| Table | Columns | Purpose |
| --- | --- | --- |
| `profiles` | `id`, `created_at` | Minimal record referencing `auth.users`; created lazily on first save |
| `resume_reviews` | `id`, `user_id`, `review_mode`, nullable `resume_filename`, `analysis_result`, `created_at` | Bounded projected summary; `user_id` is NOT NULL because anonymous reviews are not persisted |
| `resume_suggestions` | `id`, `review_id`, `finding_id`, `original_text`, `suggested_text`, `status`, `created_at` | Limited rewrite excerpts, cascading with their parent |

All three tables enable and force RLS. Anonymous API roles have no privileges. Authenticated policies require the caller's `auth.uid()`, reject Supabase anonymous identities, and check parent ownership/expiry for suggestions. Column-level INSERT grants prohibit client-supplied timestamps; UPDATE is not granted. Direct insertion is constrained by RLS, strict JSON/check constraints, and limit triggers, not just the web application. Owners can delete their records. Deleting an Auth user cascades through profile, reviews, and suggestions.

`save_resume_review(p_id,p_review_mode,p_resume_filename,p_analysis_result,p_suggestions)` is a fixed-search-path **SECURITY INVOKER** function. Ownership comes only from `auth.uid()`. It atomically creates the minimal profile, review, and suggestions. Advisory transaction locks serialize owner/review limit checks. An owned, still-visible ID returns its original snapshot unchanged; foreign or expired conflicting IDs fail. Full hosted multi-connection concurrency remains an operational check, not something the single-connection embedded tests prove.

## Application security boundary

- Request-scoped `@supabase/ssr` clients use a publishable key and the caller's session cookies. No browser SDK, browser token storage, privileged key, or shared client instance.
- Auth cookies are HTTP-only, SameSite=Lax, root-path, and Secure in production. Server Route Handlers call `auth.getUser()` for verified current identity, rejecting missing, anonymous, unconfirmed, or non-email identities. `getSession()` and client-supplied user IDs are never authorization sources.
- All session-dependent operations occur in Route Handlers, which can write refreshed cookies. Pages do not authorize in Server Components, so this route-only design does not use a Next `proxy.ts`. If adding protected Server Components later, implement the documented Supabase SSR refresh/proxy pattern rather than reusing an unchecked cookie session.
- GET history adds an explicit verified-owner filter, 30-day cutoff, ordered limit of 20, and strict result validation on top of RLS. DELETE filters by verified owner and ID and checks RETURNING; a zero-row deletion is not reported as success.
- Saves include `expected_account_email`, bound to the account shown at consent. The server compares it with the current verified `auth.getUser().email` before RPC and returns `ACCOUNT_CHANGED` on mismatch; the UI clears old consent. This comparison is never an ownership authority, RPC parameter, or persisted field: ownership remains exclusively `auth.uid()`. Projected summary size is checked before consent/save, with explicit local-size guidance and no request or silent truncation.
- Auth requests validate origin, bounded body, and schema before consuming the process-local auth budget. Valid malicious traffic can still exhaust that shared budget; distributed per-client controls remain required.
- Writes require exact same-origin JSON, bounded streamed bytes, strict schemas, and explicit save consent. DELETE accepts `{}`. Request bodies cannot supply ownership, credentials fields, or document fields. Saved analysis is capped at 32,000 serialized UTF-8 bytes (below the SQL 32 KiB bound with room for JSONB spacing); 12 excerpts are capped at 2,500 characters each side.
- Recognizable key/private-key forms and configured secret values are rejected from save payloads. This is best-effort detection, not a claim that arbitrary prose cannot contain a secret; users must inspect the exact preview and must not save credentials or confidential material. Database records are never used for application credential configuration.
- Response headers are `Cache-Control: private, no-store`, `Vary: Cookie`, and `X-Content-Type-Options: nosniff`; provider diagnostics are not exposed. Callback redirects are fixed relative `/account` paths, never a supplied `next` URL or Host override.
- SDK network calls have a 10-second per-fetch deadline. Process-local limits allow four concurrent account operations, ten auth starts, sixty reads, and twenty writes per minute. These are coarse resource limits, **not distributed abuse protection**. Configure trusted ingress, per-identity/network rate controls, Auth protections, and operating alerts before public deployment.
- UI requests have deadlines, duplicate guards, stale-response cancellation, safe error copy, private-state clearing on logout/401, and account revalidation when returning from another tab. Account links from the review page open separately to preserve the memory-only draft. No persistence failure clears or blocks the anonymous workspace.

## Retention and deletion

Reviews and their children become unreadable by authenticated users at `created_at <= now() - interval '30 days'`. `delete_expired_resume_reviews()` is a narrowly scoped fixed-search-path SECURITY DEFINER cleanup function owned by `postgres`, executable only by authorized privileged roles. The scheduled job physically deletes expired reviews and cascades suggestions; an hourly schedule can leave an expired row physically present for up to the scheduling delay, or longer if the job fails. Alert on failures.

User-requested deletion removes the selected database row and children immediately on successful commit. It does not delete browser-local drafts, downloaded files, or Google's separately processed data. A minimal profile and Auth account remain after all summaries are deleted. Full account deletion is an administrative Supabase Auth action in this phase, not a misleading nonfunctional UI control. An operator must support that request; deleting the Auth user cascades application rows. The implementation does not promise provider backup deletion or zero retention: review Supabase backup/PITR/log policies and document the applicable retention separately. Never log resume/summary text, passwords, confirmation codes, or tokens.

## Verification and remaining limits

Final `npm run check` passed on **2026-11-07**: **710 unit/integration tests in 23 files**, **120 desktop/mobile browser/API tests**, zero-warning lint, strict TypeScript, and production build. This includes 47 SDK-boundary server/config/projection checks, 55 database/RLS checks, and 30 account/history browser executions. An earlier full run was intentionally stopped after final frontend changes landed; this passing run rebuilt and tested the final code. No live AI call was needed for this milestone.

- Production migration executed against real embedded PostgreSQL using PGlite, test-only Auth helpers, and non-superuser API roles: **55 RLS/database tests passed**. Includes unauthorized access, two-user isolation, forgery, direct insert limits, immutable columns, atomic rollback, idempotency, expiry, physical purge, function privileges, and deletion cascades.
- Server/config/projection tests mock only SDK/cookie boundaries and do not send signup emails or create hosted users. They cover auth validation, anonymous compatibility, verified ownership, strict projection, credential rejection, origin/body bounds, secure cookie writes, safe errors, disabled history, and confirmed deletion.
- Browser tests use mocked Auth/history responses; extraction, anonymous review UI, controlled editing, and DOCX routes retain their existing independent coverage. Mocked auth and PGlite are **not live Supabase Auth/RLS verification**.
- Actual development app: `/api/account` returned HTTP 200 with configured Auth, no signed-in user, and history disabled; `/api/review-history` returned the expected safe HISTORY_DISABLED response. A real anonymous pasted-resume → confirmation → local-check flow passed without an account. Desktop and 320px mobile account screens were inspected with no page errors or overflow. These checks did not create an account or send email.
- Configured-value scan found zero matches across 39 changed/new files and 14 browser JavaScript assets. `.env.local` remains ignored. Runtime audit: zero findings; full audit: thirteen existing tooling entries (two low, eleven moderate).
- Hosted authenticated journeys, hosted RLS deployment, actual pg_cron execution, production SMTP, distributed limiting, provider backup retention, password reset/account-deletion UI, and public deployment are not claimed complete.

## References

- [Supabase SSR with Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PGlite](https://pglite.dev/docs/)
- [Requested frontend design guidance](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- [Requested UI UX Pro Max guidance](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md)

The interface preserves ResumeIQ's existing colors, typography, accessible labels/focus, narrow layouts, and anonymous-first flow rather than introducing an account-led redesign.
