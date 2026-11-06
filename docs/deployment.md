# Vercel demonstration deployment

## Current status — 2026-11-07

**Not deployed.** Vercel CLI 65.12.1 reports `Logged out`; no project has been linked, no hosted environment has been configured, and no deployment URL exists for this milestone. The required deliverable is a working hosted product, so this milestone remains incomplete until authentication and hosted checks below succeed. Do not confuse preparation or a local production build with Vercel verification.

The intended deployment is an **access-protected, synthetic-only demonstration**. The earlier QA review does not approve unrestricted public production. No Supabase migration, privileged cleanup job, new hosted identity, Git commit, or push is part of this deployment preparation.

## Platform configuration

- Next.js preset, project root at this directory, **Node 24.x**, `npm ci`, `npm run build`; retain the npm lockfile. `vercel.json` records install/build and cancellation configuration. No static export or Edge runtime.
- File upload: **4 MiB**, with at most 64 KiB multipart framing. Both remain below even a decimal 4.5 MB function request limit. Browser and server enforce the same file cap. Requests beyond the platform limit can receive Vercel's own 413 before application error handling.
- DOCX output: **4 MiB maximum**, below the response ceiling. Export JSON is bounded separately; generation and canonical text re-extraction must succeed before download.
- Route durations: extraction 45 seconds (15-second body read plus 15-second child deadline and overhead), Gemini 90 seconds (adapter deadline 60 seconds), export 45 seconds. Browser waits and explicit retries remain independent.
- `supportsCancellation` is enabled for these three Node routes. The code propagates request cancellation, but actual proxy disconnect behavior still needs hosted verification. Cancellation does not guarantee provider work/charges stop.
- The parser still runs in a separate, killable Node process with a reduced environment, a 192 MiB V8 old-space cap, bounded input/output, and process-local concurrency. This is not a complete OS sandbox, total-RSS limit, or distributed abuse control.

### Isolated parser packaging

`next.config.ts` uses `outputFileTracingIncludes` for `/api/resume/extract`. `scripts/deployment-tracing.ts` includes owned worker/shared source, root package metadata, and only the parser's installed runtime dependency closure. It follows nested package resolution, includes assets and installed optional native dependencies, and fails on missing required dependencies rather than silently shipping a broken parser. It does not copy the entire development dependency tree or `.env.local`.

After building, run:

```sh
npm run test:worker:package
```

This copies **only files listed by the generated extraction-route trace** into a new OS temporary directory outside the repository, launches the worker there with a reduced environment, and tests pasted text, a real synthetic PDF, and a real synthetic DOCX. Temporary files are removed afterward. It reports counts/status, not documents or credentials. Success proves that the local trace is self-contained on the tested OS—not that Linux-native packages, Vercel child processes, cold starts, resources, or proxy cancellation work. The Vercel build must install its own Linux dependencies; never upload Windows `node_modules`.

## Environment and credential handling

`.env.local` is excluded by `.gitignore`; `.vercelignore` separately excludes local environment files, credentials, private folders, original documents, build output, dependencies, and QA artifacts from source uploads. Only the blank `.env.example` template is allowed. Do not commit or deploy a real environment file. Do not use `next.config`'s `env` option for secrets.

Configure in Vercel **Project → Settings → Environment Variables**, scoped to the intended Preview environment first:

| Variable | Demo setting | Exposure |
| --- | --- | --- |
| `GEMINI_API_KEY` | Actual configured provider key | Secret, server only; mark sensitive where supported |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite`, subject to account/model availability | Server configuration |
| `GEMINI_DATA_POLICY` | `synthetic-only` | Server policy; do not bypass for real resumes |
| `SUPABASE_HISTORY_ENABLED` | `false` | Server capability gate |
| `NEXT_PUBLIC_SUPABASE_URL` | Omit for anonymous-only demo | Public-by-design optional project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Omit for anonymous-only demo | Public-by-design optional publishable key, never privileged |

No service-role key or database password is needed by this application. Keep optional Supabase credentials out of this demo unless intentionally demonstrating verified Auth. The last hosted check found required history tables absent; a flag alone cannot repair that. See [Supabase setup](supabase.md) before enabling history.

Do not run a broad `env pull` over the existing `.env.local`, dump environment values, pass secrets on command lines, or paste tokens in chat. CLI automation, if used, must send an allowlisted credential via stdin and suppress secret-bearing output. Environment changes require a new deployment.

## Deploy after authentication

1. Complete `npx vercel login` interactively. In Claude Code, use `! npx vercel login` so the authenticated CLI remains in this session. Do not send a token to the assistant. Do not use temporary/unclaimed deployment to bypass authentication.
2. Select the intended Vercel account/team and project using `npx vercel link`. Inspect an existing project before modifying it; do not replace unrelated settings. Linking metadata stays in ignored `.vercel/`.
3. Verify **Deployment Protection** covers the exact Preview URL and its API routes before adding an active provider key. Confirm an unauthenticated request cannot invoke `/api/reviews`, `/api/resume/extract`, or `/api/resume/export`. Use Vercel Authentication or another appropriate protected-access option available on the plan. A hard-to-guess URL is not protection. Give intended demonstrators access; never publish a bypass token.
4. Set the Preview environment above. Configure provider quota/spend controls and monitor usage; application process-local caps are not hard budgets. Keep the audience and demonstration requests bounded.
5. Run `npm run check`, then `npm run test:worker:package`, review the complete changes and secret exclusions, and deploy the working source with `npx vercel deploy`. This does not require creating a GitHub repository or pushing the branch.
6. Inspect the Vercel build outcome and exact URL, function bundle/resource settings, Node version and protection. Do not print complete request bodies or provider output from logs.
7. Run the hosted matrix below. Only then distribute the protected URL to authorized demonstrators. Do not use `--prod` or promote to an unprotected production alias as a shortcut. A public release needs the remaining QA security requirements.

## Hosted acceptance matrix — all pending

| Check | Required observation |
| --- | --- |
| Access restrictions | Unauthenticated visitors cannot reach credentialed APIs; intended audience can open the protected app |
| Landing/mobile | Real navigation and focus work; no horizontal overflow at desktop, 390px, and 320px |
| PDF and DOCX | Real synthetic bytes upload and extract on Linux/Vercel; exact expected text and warnings display |
| Paste/confirmation | Paste preparation succeeds; edits/mode/JD changes invalidate confirmation |
| File boundaries | 4 MiB policy enforced by browser and server; malformed/unsupported/oversized inputs produce safe recovery |
| General review | One deliberate synthetic request returns validated feedback from the configured provider, not a mock |
| Job-specific review | One deliberate synthetic request shows exact resume/JD evidence and cautious requirement statuses |
| Controlled editing | Inspect actual eligible suggestions, accept/reject/save manual wording/undo; original unchanged |
| Real DOCX | Download has correct MIME/filename, opens and re-extracts to approved text; return preserves workspace |
| Errors/cancellation | Invalid input, network interruption, cancelled work and unavailable provider handled honestly; no fake fallback |
| Secrets/privacy | No provider credentials in HTML/client JS/errors; no raw document storage or sensitive logging |
| Operational scope | History off unless independently verified; platform usage/budgets and privacy restrictions confirmed |

Use [the concise presenter script](demo-script.md). One review per mode is the planned hosted smoke budget; the adapter may make its existing single eligible correction. Record failures and do not repeatedly retry to manufacture a success. A useful review and a safely rejected invalid response are different outcomes.

## Verification record

- Earlier independent QA: 818 unit/integration tests, 150 desktop/mobile browser/API tests, lint/types/build passed. Separate live Gemini: 8/9 fixture checks passed, overall command failed; weak-general returned `INVALID_RESPONSE`. This limitation is unresolved.
- Preparation checks: deployment-tracing regressions (6) and lint/strict types passed. An initial full gate found one stale `5.0 MB` display expectation after the intentional cap reduction; it was updated to `4.0 MB` without changing validation behavior. The rebuilt preparation gate subsequently passed: 824 unit/integration tests, 150 production desktop/mobile browser/API tests, lint, strict types, and build. The projectless trace check passed pasted/PDF/DOCX extraction from 2,684 traced files (106 MiB) on Windows. These results precede the subsequent dark-theme/animation request; Linux/Vercel remains unverified.
- Actual development-app smoke: desktop 1440px, mobile 390px and narrow 320px completed real PDF/DOCX upload, confirmation and local checks with zero page errors/overflow. Landing and setup screenshots were inspected. Five primary text/action/error color pairs exceeded 4.5:1 contrast; this is not a full accessibility audit.
- Post-build bounded secret scan: 76 changed/new files, 14 browser assets, zero configured-value matches; zero staged blobs. The generated extraction trace contains the worker and 2,684 files, with no environment/private/artifact paths. `.vercelignore` checks rejected 13 representative private/generated paths and retained 5 required source/template paths.
- The first config reload exposed package lookup of `string_decoder` as a Node builtin. Dependency lookup was corrected to use ordinary package search paths and covered by a nested/builtin-name regression. The stopped dev server was restarted successfully; no isolation was removed.
- Final theme and review follow-up: **838 unit/integration tests, 168 production desktop/mobile browser/API tests**, lint/types/build passed; all three projectless worker checks passed again (2,684 files, 106 MiB Windows). Actual-app desktop and dark 320px downloads/return measured scrollY 0 with the workspace retained. [Final review report](final-review-followup.md) records the fixed high-priority evidence/navigation defects, auth admission correction, remaining AI false-rejection cases, and exact scan scope.
- Hosted build, configured Vercel AI connectivity, uploads, downloads, cancellation, mobile layout, and protected access: **not run; authentication blocked**.

## Official references

- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Node.js runtime and tracing](https://vercel.com/docs/functions/runtimes/node-js)
- [Function cancellation API](https://vercel.com/docs/functions/functions-api-reference)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [UI UX Pro Max design guidance supplied by the user](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md) — read as design guidance; its local search tooling was not installed or executed.
