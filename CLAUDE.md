# ResumeIQ engineering guide

## Product and scope

Build a reliable 1–2 day MVP for anyone improving a resume. Required modes:
- General Resume Review: no job description required.
- Job-Specific Review: compare the resume to a supplied job description.

Required order: Upload Resume → Choose Review Mode → Confirm Extracted Text → Analyze → Review Feedback → Improve Resume → Export DOCX.

Current authorized milestone is **optional Supabase Auth and minimized saved review history**, after the complete anonymous workflow and DOCX export. Accounts must never block first review, extraction, editing, or export. Use server-verified identity, strict input/result schemas, own-user RLS, explicit storage consent, bounded summary/excerpt projection, 30-day expiry plus scheduled cleanup, and confirmed deletion. No persistent resume files, full documents/JDs, edited drafts, or application credentials in records. History remains disabled until the operator installs migration and retention. See `docs/supabase.md`. Preserve **downloadable DOCX export**, following controlled resume improvement. Generate only the current improved preview on the server with runtime `docx`, verify archive structure and re-extracted text, preserve source facts/sections, and never claim original-layout preservation. Export includes accepted AI/manual edits only, never rejected or unaccepted suggestion drafts. Preserve originals and local state on failures; cancel stale downloads on workspace revisions. See `docs/docx-export.md`. Keep the confirmed original immutable and the improved draft separate. Use exact original-coordinate patches, explicit duplicate-target selection, conflict/stale checks, accept/reject/manual controls, undo, and restore; never apply AI text automatically. Preserve in-memory drafts across analysis invalidation and confirm workspace replacement/reset. Maintain a precise, secret-free human prompt history in root `CHAT_LOG.md`. See `docs/resume-improvement.md`. Preserve exact job/resume evidence and nullable missing job fields; unmatched extracted requirements stay Not assessed. Keep rendering separate from analysis and never infer absent skills from absent resume evidence. See `docs/results-dashboard.md`. Keep local text checks independent. AI review requires confirmed text, an editable minimized provider preview, explicit consent, server-only credentials/model, bounded requests, and validated evidence-backed output. The provider-independent interface also supports conservative extractive bullet shortening; no automatic edits. DOCX export requires an explicit user action, without another AI call. Do not add persistence beyond the authorized minimal summaries, cloud deployment, unrestricted generative rewriting, PDF export, or multiple templates until requested. No scores or fake AI results. Configuration is synthetic-only by default; real personal data requires explicit operator-reviewed paid-service policy. See `docs/ai-integration.md`. Never claim live success from mocks.

Keep `src/lib/resume-analysis` pure and independent of React, Next, providers, I/O, clocks, and randomness. Validate input/options; retain stable IDs and exact evidence offsets. Distinguish objective observations from optional stylistic suggestions. Never infer missing facts, require metrics in every bullet, or present heuristic thresholds as industry standards. Projects relevance must be explicit. Test rules independently before UI integration and invalidate findings on source/preferences changes. See `docs/deterministic-analysis.md` for the contract and limitations.

## Runtime and commands

Use Node 24.x (verified on 24.20.0) and npm 11.x. Use npm and retain `package-lock.json`; prefer `npm ci` for reproducing the environment. Versions are pinned; check official documentation, peer dependencies, engines, and audit output before changing them.

```sh
npm ci
npx playwright install chromium
npm run dev                 # http://localhost:3000
npm run lint                # ESLint, zero warnings allowed
npm run typecheck           # Next route type generation + strict TypeScript
npm test                    # Vitest, single run
npm run test:watch
npm run build
npm run start               # requires a successful build
npm run test:e2e            # production build must already exist; owns port 3100
npm run test:e2e:dev        # real dev server; owns port 3101
npm run check              # lint → types → unit → build → production E2E
npm audit
npm audit --omit=dev
```

Run production and development E2E sequentially (ports 3100 and 3101 respectively). Stop a manually running dev server before dev E2E; Next uses a project-wide dev lock. Playwright deliberately refuses to reuse an arbitrary running server and launches the Next CLI directly to avoid extra npm wrapper processes. Browser installation may need internet access; Linux CI can use `npx playwright install --with-deps chromium`.

## Architecture

- `src/app`: App Router layouts, pages, and later thin Route Handlers. Server Components by default; client components only where interaction requires them.
- `src/components/ui`: shadcn/ui primitives (current base-nova / Base UI style). Preserve accessible semantics; do not assume Radix `asChild` APIs.
- `src/features/review`: local setup UI in `components/`, state/race handling in `use-review-setup.ts`, pure validation in `validation.ts`, and shared mode descriptions in `review-options.ts`.
- `src/lib/resume`: shared Zod extraction/confirmation schemas, limits, and file screening. No provider or database imports. `src/lib/contracts` remains reserved for later domains.
- `src/lib/resume-analysis`: standalone `analyzeResume(text, options)` with strict input contracts, deterministic rule groups, exact evidence, and no scores, I/O, or framework dependency. The UI invokes this shared implementation rather than duplicating rules.
- `src/lib/resume-improvement`: pure strict editing contracts, immutable-original patching, bounded target disambiguation, conservative AI rewrite safety, and local undo history. No provider or framework dependency.
- `src/lib/config`: pure configuration validation; never read secrets from a client module.
- `src/server/config`: server-only environment access, validated when needed rather than at build time.
- `src/lib/ai-review`: shared strict request/response schemas and best-effort contact minimization.
- `src/server/ai`: provider-independent interface, server-only Gemini adapter, bounded requests, local duplicate/cost guards, and strict output/evidence validation. Only the adapter imports SDK types.
- `src/server/resume-processing`: bounded input, server file validation, child-process lifecycle, PDF/DOCX extractors, normalization, and completeness checks. Node 24 runs owned TypeScript worker source; preserve source files/runtime dependencies in deployment.
- `src/lib/resume-export`: browser-safe strict export contracts, size/line/character limits.
- `src/server/documents`: bounded in-memory DOCX generation, archive validation, and exact canonical text re-extraction before download.
- `src/server/http`: shared bounded same-origin JSON reader for AI and export.
- `src/lib/saved-reviews`: strict minimized summary contracts/projection. `src/features/saved-reviews`: optional inline Auth, save consent, private read-only history.
- `src/server/supabase`: request-scoped verified cookie Auth and ownership-filtered history. `supabase/`: operator-applied SQL/RLS/retention. No privileged application key or resume-file storage.
- `tests/unit`: pure module tests. `tests/e2e`: actual browser journeys.

Import direction: UI/route → focused application logic → server adapter. Server adapters may depend on shared contracts, never the reverse. Use `import "server-only"` in secret-bearing, AI, persistence, and document modules. Use Node runtime, not Edge, for document handlers. Do not add generic repositories, provider factories, or a global state library before there is a demonstrated need.

See `docs/design-system.md` for visual conventions and `docs/extraction.md` for the current workflow, limits, verification, and deployment constraints. File input is limited to 4 MiB; PDF to 20 pages; text to 80,000 characters. Browser screening is never the server security boundary. Server parsing has bounded ZIP expansion, a 15-second kill deadline, and local concurrency/heap caps; OS/container limits and distributed rate limits remain release requirements.

## Engineering rules

- TypeScript `strict` and `noUncheckedIndexedAccess` stay enabled. No explicit `any`; use `unknown`, Zod, and narrowing at boundaries.
- Small, focused modules; reuse business logic rather than duplicating it in UI and handlers.
- Validate every external input: environment, uploads, request bodies, model output, and persisted records.
- Define API schemas before endpoints and infer TypeScript types from them. Return consistent typed errors without raw provider messages, secrets, or resume text.
- Provide loading, error, empty, and success states for every asynchronous feature. Preserve user edits on recoverable failures. Prevent accidental duplicate paid requests.
- Never put secret credentials in `NEXT_PUBLIC_*`. Supabase's explicitly publishable key is the only public-key configuration exception; secret/service-role and Gemini keys remain server-only. Never import server adapters into client components. `.env.local` stays ignored; only `.env.example` is tracked.
- No sensitive document contents, prompts, provider responses, API keys, or personal data in logs or analytics. Never use real resumes in committed test fixtures.
- Do not fetch remote fonts at build time; the foundation intentionally uses a system font stack.
- Inspect existing files before overwriting them. Do not commit, push, publish, or provision cloud resources without authorization.

## Critical product and security constraints for subsequent work

- Gemini is the initial provider, through the maintained `@google/genai` SDK. Do not substitute Anthropic/OpenAI. Require an explicit model setting and verify its availability before enabling analysis.
- Confirm/edit extracted text and get explicit AI-processing consent before any provider request. Treat resume and job description as untrusted data, not instructions.
- Never invent achievements, metrics, employers, qualifications, or dates. Suggested additions must be clearly labeled and user-confirmed. No unsubstantiated ATS-pass or hiring guarantees.
- No OCR, legacy `.doc`, payments, or PDF export. Optional accounts and minimal summary history are authorized only after the functional core workflow. Explain unsupported/scanned/corrupt files and offer correction or a supported alternative.
- Check extension, MIME, file signature, size, text length, and parser resource consumption. MIME alone is not authoritative. Release PDF parser resources in `finally`; avoid DOCX-to-HTML rendering.
- Implement actual parse cancellation/isolation; `Promise.race` alone does not stop CPU-bound parsing. Bound ZIP expansion and processing time.
- Set timeouts and bounded retry policy for Gemini; validate structured output with Zod. Never render model-generated HTML. Public AI endpoints require rate limits and budget controls.
- Keep the anonymous workflow and editing workspace memory-only. Optional Supabase persists only consented, minimized summaries/excerpts with per-user authorization/RLS and retention/deletion. No automatic project provisioning or file storage. Never use a service-role key in ordinary application requests; privileged cleanup runs through an operator-controlled database job.
- Export only user-approved content to a simple ATS-friendly DOCX. Do not promise preservation of original layout.

## Git and GitHub workflow

The user has authorized conventional commits and pushes for completed development phases, subject to these safeguards:

- Inspect Git status, the active branch, and remotes first. Verify the intended GitHub repository with the user before the initial push to an unfamiliar remote. Never overwrite an existing remote.
- Ask before creating a GitHub repository or changing its visibility. Ask the user to complete authentication when needed; never request tokens/passwords in chat.
- Before staging, inspect `.gitignore`, all modified/untracked files, and the complete diff (including candidate new-file contents). Exclude secrets, company credentials, confidential files, private configuration, real resumes, node_modules, build output, debug artifacts, and unnecessary generated files. Ignore rules alone are not a secret scan.
- Run relevant tests, TypeScript, lint, and production build for each completed phase. Do not represent failing or skipped checks as passed.
- Stage only reviewed, relevant project files. Commit completed work with descriptive conventional messages; do not fabricate historical phase commits for work that was not tracked separately.
- Work on a branch rather than committing on the default branch. Push completed commits only to the verified remote. Never force-push, rewrite history, or use destructive commands to resolve a failed push.
- End commit messages with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Report the commit message, included files, full commit hash, push outcome, and remaining uncommitted changes after each phase. Explicitly state when authentication, identity, or repository approval blocks committing/pushing.

## Verification and completion

Run `npm run check` before declaring the foundation complete. Test a real dev server too after launch-related changes. Exercise UI in desktop/mobile Chromium and inspect a screenshot; include keyboard navigation and error checks. Async product features must later cover loading, validation errors, empty results, provider failures, and success.

For feature work: add focused unit tests plus E2E happy/error paths; use synthetic fixtures and mocked provider responses for deterministic tests. A credentialed live-provider smoke test is separate and must not be presented as covered by mocks.

Report exactly what passed, failed, or was not run. Do not mark planned features complete. Track compatibility/audit exceptions in `docs/dependencies.md`; never use `npm audit fix --force` without reviewing its proposed changes.
