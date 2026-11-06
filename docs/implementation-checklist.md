# Implementation checklist

The 1–2 day target prioritizes one trustworthy complete workflow over account/history features. Only check items after implementation and verification. The current authorization boundary includes **server extraction, confirmed previews, Gemini review, job-description analysis, the results dashboard, controlled resume improvement, downloadable DOCX export, and optional Supabase Auth/minimized saved summaries**.

## Phase 0 — Foundation (completed)

- [x] Inspect directory before writing: empty on 2026-11-06.
- [x] Verify Node 24.20.0 / npm 11.19.0 and relevant environment variable names without exposing values.
- [x] Check official setup guidance, npm engines/peers, and stable versions before installation.
- [x] Record architecture, dependency risks, scope, and ordered implementation plan.
- [x] Initialize Next.js App Router, strict TypeScript, Tailwind, and shadcn/ui.
- [x] Add README, CLAUDE.md, .env.example, and documented module boundaries.
- [x] Add an honest, responsive foundation preview with no simulated product actions.
- [x] Add lazy, server-only configuration access and Zod validation.
- [x] Configure Vitest and Playwright with synthetic tests.
- [x] Verify lint, typecheck, 10 unit tests, production build, and 6 production browser tests.
- [x] Verify dev-server startup, 6 dev browser tests, and inspect desktop/mobile screenshots.
- [x] Record final audit findings and verification outcomes (including unresolved tooling advisories).

## Phase 1 — Application foundation and UI (completed)

- [x] Establish typography, color, spacing, border/radius, focus, and interaction conventions.
- [x] Implement server-rendered landing page, CTA/navigation, mode/feature overview, workflow, and truthful privacy copy.
- [x] Implement `/review` with native file picker and drag/drop, size/type/basic header checks.
- [x] Implement general/job-specific radio cards with pointer and keyboard selection.
- [x] Add conditional job-description textarea, count, required/min/max validation, and edit preservation across modes.
- [x] Add local setup confirmation, file replacement/removal, reset, stale-read protection, and honest unavailable-feature messaging.
- [x] Cover empty/loading/disabled/error/success states and focus recovery.
- [x] Pass lint, strict types, 38 unit tests, production build, and 20 desktop/mobile E2E tests.
- [x] Exercise the live dev app and inspect desktop, tablet, and mobile screenshots.
- [x] No new dependencies, server uploads, extraction, AI requests, or persistent storage added.

## Completed milestone — Server upload, extraction, and text confirmation

Dependencies: foundation. Local full-project Node 24 execution; public deployment resource/packaging verification remains a release gate. See `extraction.md`.

- [x] Install verified `pdf-parse` and `mammoth` versions; recheck compatibility/audit.
- [x] Define shared upload/extraction schemas and a consistent typed API error envelope.
- [x] Implement PDF/DOCX extension, MIME, signature, actual upload size, and resource limits.
- [x] Implement killable parser processes, ZIP expansion limits, and resource cleanup (OS/container isolation remains deployment work).
- [x] Extract plain text; handle corrupt, protected, empty, and low-text/scanned documents as processing errors, with pasted-text fallback.
- [x] Implement local mode selection; require job description only for job-specific mode (Phase 1 UI).
- [x] Enforce mode/job-description validation in the analysis endpoint (completed in the later Gemini milestone; job descriptions are never sent to the extraction endpoint).
- [x] Show editable extracted/pasted text and validate confirmation; analysis was not part of this extraction milestone.
- [x] Add loading/error/empty/success states, keyboard/focus behavior, cancellation, and file replacement/reset.
- [x] Test synthetic PDF/DOCX fixtures and rejection cases; E2E upload → mode → inspect → edit → confirm.
- [x] Pass `npm run check`: lint, strict types, 112 unit/integration tests, production build, 34 desktop/mobile browser/API tests.
- [x] Drive the actual dev app through PDF, DOCX, and pasted-text confirmation; inspect desktop/mobile/320px screenshots and verify narrow-layout overflow.
- [x] Rerun runtime/full audits: zero runtime findings; unchanged 13 tooling findings (2 low, 11 moderate). No AI calls or permanent application storage.

## Current — Deterministic resume text analysis

Dependencies: normalized text; no provider credentials. See `deterministic-analysis.md`.

- [x] Expose standalone typed `analyzeResume(text, options)` independent of frontend/provider.
- [x] Validate bounded normalized input/options; use stable IDs and exact evidence offsets.
- [x] Implement structure/completeness, writing, achievement-context, and readability rule groups.
- [x] Distinguish objective observations from optional suggestions; no scores, inferred facts, industry-standard claims, or blanket metric requirements.
- [x] Require explicit relevance for projects presence; disclose English/parser/layout limitations and output cap.
- [x] Test each rule independently and five synthetic resume fixtures; verify purity, determinism, boundaries, and evidence.
- [x] Pass standalone tests/lint/types/Node execution before connecting UI.
- [x] Add explicit post-confirmation browser-local checks, evidence selection, honest empty results, and stale-result invalidation.
- [x] Pass `npm run check`: lint, strict types, 266 unit/integration tests, production build, 40 desktop/mobile browser/API tests.
- [x] Drive the live development app at 1280px, 390px, and 320px; verify evidence selection/invalidation, no page errors/overflow, and inspect screenshots.
- [x] Document API, thresholds, privacy, verification, and limitations; no new dependencies or provider calls.

## Current — Gemini AI analysis and feedback

Dependencies: confirmed text, configured key/model, explicit minimized-preview consent. Synthetic-only until operator-reviewed paid-service/privacy setup. See `ai-integration.md`.

- [x] Verify current official SDK, structured output, models, errors/rate limits and terms; pin `@google/genai@3.0.0`.
- [x] Verify authenticated model listing and actual structured generation; select `gemini-3.5-flash-lite` explicitly.
- [x] Implement provider-independent general/job/bullet interfaces; isolate SDK and credentials server-side.
- [x] Define strict general/job requests and bounded response contracts; validate exact evidence, coverage, statuses, rewrites and numeric claims.
- [x] Enforce confirmed input, explicit consent, synthetic-only policy, editable minimized previews and safe missing-config behavior.
- [x] Treat documents as untrusted data; no tools, secrets or privileged actions exposed to the model.
- [x] Add bounded request reading, origin checks, deadlines, cancellation, local concurrency/usage caps, duplicate suppression and one bounded validation correction.
- [ ] Add distributed/authenticated public-endpoint limits and provider monetary budget controls before public deployment; local caps are not a substitute.
- [x] Render assessment, three priorities, strengths, coverage, exact evidence, recommendations, optional unapplied extractive rewrites and four job-evidence statuses; no scores.
- [x] Test invalid output/evidence, fabricated metrics, unsupported skills, missing config, timeout/rate limits, input bounds, document injection, consent and stale responses with mocked provider boundaries.
- [x] Run actual Gemini general/job/injection checks using only synthetic fixtures.
- [x] Drive actual desktop general and mobile job-specific browser flows through Gemini with no API mocking; inspect screenshots and verify stale results clear.
- [ ] Verify real-user paid-service/privacy and public deployment configuration separately; not enabled by this milestone.

## Current — Job-description analysis and results dashboard

See [results-dashboard.md](results-dashboard.md) for contracts, conservative matching, and verification limits.

- [x] Extract explicit title/company, required/preferred skills, responsibilities, experience, and education/certification requirements with exact evidence; missing fields stay unknown.
- [x] Validate source slices/locations and bounded requirement inventory; disclose English/heading coverage and truncation limits.
- [x] Reuse validated AI matches without a second model call; leave unmatched extracted requirements Not assessed and allow sparse descriptions with no assessable requirements.
- [x] Render overview, three priorities, strengths/opportunities, requested finding groups, and reusable collapsible evidence/action/rewrite cards.
- [x] Add job metadata, required/preferred coverage lists, all four status filters, methodology, and limitations without invented scores or statistics.
- [x] Preserve consent, safe retry/cancel, stale-result invalidation, and add an honest loading skeleton.
- [x] Test real PDF/general and DOCX/job upload-through-dashboard journeys with validated mocked feedback and exact displayed evidence; check keyboard and narrow layouts.
- [x] Inspect desktop synthetic dashboard and mobile live job-specific dashboard screenshots; verify live DOCX → Gemini → job results. General live attempts in this milestone returned safe validation/provider errors; do not count them as successful live general verification.
- [x] Pass final `npm run check`: lint, strict types, 460 unit/integration tests, production build, and 66 desktop/mobile browser/API tests.

## Current — Controlled resume improvement

Dependencies: validated evidence-backed review. See [resume-improvement.md](resume-improvement.md).

- [x] Verify immutable confirmed original, separate improved preview, suggestion IDs/reasons/evidence/statuses, and exact original-coordinate patches.
- [x] Verify comparison, accept/reject/manual save, undo latest acceptance, and confirmed restore.
- [x] Verify duplicate-location selection, missing/redacted targets, target caps, stale revisions, overlap conflicts, and multiple same-section edits.
- [x] Verify conservative AI wording safety, explicit user-authored manual drafts, and no added provider calls.
- [x] Verify retained drafts across analysis invalidation, confirmed workspace replacement, and confirmed Start over.
- [x] Verify both modes from real upload through editing with mocked validated feedback, keyboard focus, desktop/mobile screenshots, and narrow layouts.
- [x] Pass `npm run check`: 526 unit/integration tests, 80 desktop/mobile browser/API tests, lint, strict types, and production build. Maintain root `CHAT_LOG.md`.
- [x] Record live-provider limitation honestly: fresh synthetic PDF review returned `PROVIDER_ERROR` before improvement; no retry or live-success claim.

## Current — DOCX export

Dependencies: user-approved improved preview. See [DOCX export](docx-export.md).
- [x] Promote pinned `docx` to runtime; generate a clean editable template from approved preview text only, with existing contacts/sections and no inferred facts.
- [x] Validate bounded same-origin input and generated ZIP/OOXML structure; re-extract and compare all canonical text before returning a file.
- [x] Verify invalid/empty data, Unicode, long content, generator/parser errors, accepted manual edits, and rejected/pending exclusions in focused tests.
- [x] Verify an actual development-server export response, attachment headers, and text roundtrip using synthetic data without AI calls.
- [x] Pass the full quality gate: 608 unit/integration tests, 90 desktop/mobile browser/API tests, lint, strict types, and production build. Verify both modes through real download/re-extraction, recoverable failures, stale cancellation, keyboard focus, and mobile layout; inspect desktop/mobile screenshots.
- [x] Rerun dependency audits: zero runtime findings; thirteen existing tooling entries (two low, eleven moderate). No forced fixes.

## Optional Supabase — local implementation, hosted setup pending

See [Supabase setup and security](supabase.md).

- [x] Keep anonymous extraction/review/editing/DOCX independent of accounts or database configuration.
- [x] Implement optional server-side email/password Auth, inline save consent and preview, read-only history, and confirmed deletion.
- [x] Add minimal projected summaries/excerpts, verified owner filters, strict input/result contracts, bounded same-origin requests, private uncached responses, and safe failures.
- [x] Execute migration/RLS/retention/deletion tests against embedded PostgreSQL: 55 checks; SDK-boundary server/config tests: 47 checks. Lint and strict types passed for this focused gate.
- [x] Verify hosted Auth settings connectivity using configured publishable key without displaying credentials; tables are absent, no hosted users or emails created.
- [x] Pass final `npm run check` on 2026-11-07: 710 unit/integration tests, 120 desktop/mobile browser/API tests, lint, strict types, and production build. Inspect desktop/320px account/save screens and verify actual-app anonymous review plus disabled-history behavior.
- [x] Recheck audits and configured-value exposure: zero runtime audit findings and zero configured-value matches in changed files/browser assets; thirteen existing tooling findings remain.
- [ ] Apply reviewed migration to the intended hosted project; install and monitor physical cleanup, then enable history explicitly.
- [ ] Verify hosted signup/confirmation/sign-in/save/list/delete and two-user isolation using authorized synthetic identities.
- [ ] Verify production SMTP, Auth protections, distributed rate limits, provider backup retention, and deployment behavior.

## Follow-up — history setup diagnostics and download completion (2026-11-07)

- [x] Identify the hosted blocker: history flag enabled but all three required tables return `PGRST205`; do not claim hosted saving is repaired without applying SQL.
- [x] Add safe `HISTORY_NOT_READY` errors and a verified-user zero-row readiness query; preserve identity/sign-out while hiding unavailable saving controls.
- [x] Add same-document DOCX completion, return to the preserved draft, account history in a new tab, and confirmed local reset; never automatically persist a summary.
- [x] Verify the running development app with synthetic upload, mocked AI, real export/download/text roundtrip, accepted/saved/unsaved draft preservation, browser back/forward, explicit retry, keyboard focus, and reset confirmation. Inspect desktop/320px screenshots; fix the narrow-screen reset-button overflow found by the first run.
- [x] Scan 44 changed/new files, 39 staged blobs, and 14 production browser assets: zero configured-value matches; preserve the user's index and ignored local configuration.
- [ ] Finish the rebuilt full quality gate for this follow-up.
- [ ] Hosted SQL, retention scheduling, and live authenticated save/list/delete remain pending operator setup above.

## Phase 4 — Release hardening (day 2, remaining)

- [ ] Pick hosting target; verify PDF bundling, upload limits, parser resources, and request deadlines there.
- [ ] Verify privacy notices and Google data-handling terms; keep sensitive logs disabled.
- [ ] Test keyboard access, mobile layout, all asynchronous states, and rate-limit behavior.
- [ ] Run full quality checks and review production/development dependency advisories.
- [ ] Confirm deployment secrets are server-only, raw documents/drafts are not persisted, optional summaries have verified RLS/cleanup, and no sample result fallback exists.
- [ ] Document operating costs, limits, support/recovery steps, and known unsupported formats.

## Explicitly out of scope

Automatic Supabase provisioning, persistent resume-file storage, billing, OCR, legacy DOC uploads, PDF export, multiple templates, exact source-layout preservation, arbitrary remote URL ingestion, and automated job applications. Optional accounts and minimized saved history were authorized after the complete core workflow; hosted setup and verification remain separate operator steps.
