# Implementation checklist

The 1–2 day target prioritizes one trustworthy complete workflow over account/history features. Only check items after implementation and verification. The current authorization boundary is **server upload, extraction, and editable text confirmation**. AI analysis and export remain future work.

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
- [ ] Enforce mode/job-description validation in the future analysis endpoint (not part of extraction; job descriptions are never sent to the extraction endpoint).
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

## Phase 2 — AI analysis and feedback (next)

Dependencies: confirmed text; Gemini key, chosen model, quota/billing; consent copy.

- [ ] Install maintained `@google/genai`; validate server-only configuration lazily.
- [ ] Define discriminated general/job-specific request schemas and bounded structured response schema.
- [ ] Implement server-only Gemini request with consent, timeout, bounded retries, and output validation.
- [ ] Treat supplied documents as untrusted data and prohibit invented facts.
- [ ] Add public-endpoint rate limits, request bounds, duplicate-submit protection, and budget controls.
- [ ] Render prioritized feedback, source evidence, and honest limitations; no fabricated ATS scores.
- [ ] Test absent config, invalid input/output, throttling, provider errors, and timeouts using mocks.
- [ ] Run a separately authorized live-provider smoke test with synthetic data.

## Phase 3 — Improvements and export (day 2, first)

Dependencies: valid analysis and user-approved content model.

- [ ] Implement user edits and clear accept/reject controls; retain original facts.
- [ ] Invalidate stale results when source text/mode/job description changes.
- [ ] Move `docx` from fixture-only dev dependency to runtime when export is authorized; generate simple ATS-friendly DOCX from approved content only.
- [ ] Handle download failures and invalid/empty export data.
- [ ] Test DOCX structure and round-trip text; no formatting-preservation claim.
- [ ] E2E both modes through export, including recoverable failures.

## Phase 4 — Release hardening (day 2, remaining)

- [ ] Pick hosting target; verify PDF bundling, upload limits, parser resources, and request deadlines there.
- [ ] Verify privacy notices and Google data-handling terms; keep sensitive logs disabled.
- [ ] Test keyboard access, mobile layout, all asynchronous states, and rate-limit behavior.
- [ ] Run full quality checks and review production/development dependency advisories.
- [ ] Confirm deployment secrets are server-only, no document persistence, and no sample result fallback.
- [ ] Document operating costs, limits, support/recovery steps, and known unsupported formats.

## Explicitly out of scope

Accounts, saved review history, Supabase provisioning, billing, OCR, legacy DOC uploads, PDF export, multiple templates, exact source-layout preservation, arbitrary remote URL ingestion, and automated job applications. Reconsider only after the core workflow works end to end.
