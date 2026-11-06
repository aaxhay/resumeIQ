# ResumeIQ

A resume-review application with **PDF/DOCX extraction, editable confirmation, local deterministic checks, and optional Gemini AI feedback**. General and job-specific results include a grouped, collapsible dashboard; job review adds explicit job fields and requirement-level evidence statuses. Controlled improvement adds a separate draft with accept/reject, manual wording edits, undo, and restore. The current improved preview can be downloaded as a clean, editable DOCX. No ATS scores, hiring guarantees, or automatic resume changes.

## Local setup

Verified on Windows 11 / Git Bash, Node **24.20.0**, npm **11.19.0**. Use Node 24.x and npm 11.x. No database is required. Extraction and deterministic checks work without an API key.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000/review**. Upload a PDF/DOCX up to 5 MiB or paste text; select a mode; extract/prepare; inspect and edit; confirm. **Run text checks** executes local rules without provider calls. For optional AI feedback, review the minimized provider previews, remove unnecessary personal information, give explicit consent, and choose **Send previews to Gemini**.

After Gemini results, choose **Improve this resume**. Compare suggestions, choose a location for repeated text, save manual wording, then accept or reject each change. Undo the latest accepted edit or restore the original. The draft is separate from the confirmed source and survives changes to review inputs; replacing it or starting over requires confirmation. It is memory-only: download the improved DOCX or copy anything you want to retain before leaving. **Download DOCX** sends only the current improved preview to this application's server for in-memory generation and text verification, not to Google. Accept saved manual edits first; unaccepted and rejected suggestions are not exported. The clean template does not reproduce the original layout. See [controlled improvement](docs/resume-improvement.md) and [DOCX export](docs/docx-export.md).

Job-specific mode requires a 50–10,000-character job description. It stays local during extraction/local checks and is sent to Gemini only through the explicit AI action. AI resumes are limited to 30,000 characters; extraction/editing separately allows 80,000. No silent input truncation.

### Gemini configuration and personal-data gate

Copy `.env.example` to ignored `.env.local` without overwriting an existing configuration. Set server-only `GEMINI_API_KEY` and explicitly selected `GEMINI_MODEL`. Never put credentials in `NEXT_PUBLIC_*`, tracked templates, or chat. Official SDK: `@google/genai@3.0.0`. Missing credentials disable AI rather than produce fake results.

**Default AI use is synthetic-only.** Google unpaid-service terms prohibit personal/confidential inputs. Do not mark a real resume as synthetic even after redaction. `GEMINI_DATA_POLICY=paid-reviewed` is reserved for an operator who has verified paid-service terms/billing, supported regions, adult-use/access restrictions, privacy disclosures, and deployment safeguards. It is not automatic billing verification and has not been enabled here. See [AI integration and data-handling limits](docs/ai-integration.md).

Best-effort contact removal is not anonymity; names, addresses, and identifying context can remain. Provider previews are editable. The application does not persist or log raw resumes, prompts, or AI responses. Google has separate processing/retention terms. Cancellation or timeout does not guarantee avoidance of provider charges.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm run start` | Build / serve production application |
| `npm run lint` | ESLint, zero warnings |
| `npm run typecheck` | Next route types and strict TypeScript |
| `npm test` / `npm run test:watch` | Deterministic unit tests / watch mode |
| `npm run test:e2e` | Production desktop/mobile Chromium tests |
| `npm run test:e2e:dev` | Dedicated development-server browser tests |
| `npm run check` | Lint → types → unit tests → build → production E2E |
| `npm run test:ai:live` | Explicit paid-capable Gemini verification using synthetic fixtures only |
| `npm audit --omit=dev` | Runtime advisory inspection |

Install browser tooling with `npx playwright install chromium`. Production E2E requires a build unless using `npm run check`. Playwright owns 127.0.0.1:3100 (production) or 3101 (dev), with no reuse of arbitrary servers. Run production/dev E2E sequentially and stop any manual dev server before dev E2E because Next uses a project-wide lock. Linux CI may need `npx playwright install --with-deps chromium`.

The ordinary test suite mocks provider boundaries and makes no paid analysis calls. The live command is separate, uses `.env.local`, exercises both modes and document-injection fixtures, and prints safe validation metadata only. A build or mock success is not proof of live model access.

## Architecture

```text
src/app/                     Pages and thin Node API routes
src/components/              Shared UI and landing sections
src/features/review/         Upload/editor, local checks, AI previews/consent/results
src/lib/resume/              Shared extraction contracts and limits
src/lib/resume-analysis/     Pure deterministic analyzer and evidence rules
src/lib/ai-review/           Strict AI contracts and contact minimization
src/lib/job-description/     Pure explicit-field extraction and evidence contracts
src/lib/resume-improvement/  Immutable-original patches, suggestion states, local undo
src/lib/config/             Pure configuration validation
src/server/resume-processing/ Bounded isolated PDF/DOCX extraction
src/server/ai/               Provider interface, Gemini adapter, validation, cost guards
src/server/config/           Server-only environment access
src/lib/resume-export/       Bounded export contracts and line handling
src/server/documents/        DOCX generation and round-trip verification
src/server/http/             Shared bounded same-origin JSON reader
src/server/data/             Reserved optional persistence
scripts/verify-gemini.ts     Explicit synthetic live-provider verification
```

The rest of the application uses `ResumeAiProvider`, not Gemini SDK types. Model output is checked by Zod plus exact citations, full area coverage, conservative job-evidence rules and numeric guards. Optional rewrites are extractive shortening only; no new facts or words are added. Exact citations do not prove semantic or factual truth. Review all AI advice before use.

## Current limits and release blockers

- English-oriented text analysis, not original-layout assessment, fact checking, or exhaustive job coverage.
- No accounts/saved review history, database, OCR, legacy DOC, billing UI, public deployment, or full generative rewriting. The editing workspace has only a memory-local accepted-edit history.
- AI requests have deadlines, duplicate suppression, local concurrency and request caps. These are **not distributed abuse protection or monetary budgets**; do not expose the endpoint publicly until authenticated/trusted ingress, distributed controls, provider budget limits, and deployment behavior are verified.
- Local full-project Node execution is supported. Keep worker sources and runtime dependencies; `.next`-only, standalone, Edge, and serverless packaging are not verified. Builds use system fonts without external font fetching.
- Existing tooling advisories and compatibility exceptions are documented; no forced dependency fixes.

## Documentation and verification

Latest DOCX-export quality gate: **608 unit/integration tests**, **90 desktop/mobile browser/API tests**, lint, strict types, and production build passed. Both review modes download real generated DOCX files and re-extract their text to verify accepted edits, rejected exclusions, and original preservation; the AI review is mocked in these deterministic browser tests. A separate actual development-server export roundtrip also passed. Post-promotion audit: zero runtime findings, thirteen existing tooling entries. See [DOCX export verification](docs/docx-export.md#verification).

Earlier job-claim recovery quality gate: **542 unit/integration tests**, **84 desktop/mobile browser/API tests**, lint, strict types, and production build passed.

Job-specific claim recovery: a live synthetic composite job description reproduced the reported unsupported-claim failure; after targeted correction diagnostics and clearer evidence instructions, the same case returned validated feedback. Strict checks remain enabled, with no silent claim downgrades or extra retries. The UI now distinguishes unsupported job matches from unverified numbers. See [job-specific claim recovery](docs/ai-integration.md#job-specific-claim-recovery-2026-11-06).

Earlier controlled-improvement quality gate: **526 unit/integration tests**, **80 desktop/mobile browser/API tests**, lint, strict types, and production build passed. Both modes cover actual upload through controlled editing using validated mocked reviews. Desktop/mobile development-app screenshots were also inspected. A separate fresh live synthetic Gemini attempt returned `PROVIDER_ERROR` before reaching improvement; it was not retried or counted as live success. See [controlled-improvement verification](docs/resume-improvement.md#verification).

Earlier validation-recovery quality gate: **482 unit/integration tests**, **68 desktop/mobile browser/API tests**, lint, strict types, and production build passed. Invalid Gemini output remains rejected; additional structural/evidence failures now qualify for the existing single correction attempt, and the UI displays safe failure categories without document contents.

Dashboard milestone quality gate: **460 unit/integration tests**, **66 desktop/mobile browser/API tests**, lint, strict TypeScript, and production build passed. Both modes were tested from real PDF/DOCX upload through dashboard with semantically validated mocked feedback. A live synthetic DOCX → Gemini → job-specific dashboard run also passed; fresh general-mode live attempts returned `INVALID_RESPONSE` and `PROVIDER_ERROR`, with no feedback displayed. Those failed attempts remain recorded as failures. A subsequent recovery fix added missing correction eligibility and safe validation reasons; a fresh real PDF → Gemini → general dashboard run then passed. See [validation-error recovery](docs/ai-integration.md#validation-error-recovery-and-safe-diagnostics). Desktop/mobile screenshots were inspected. The last dependency audit remains zero runtime findings and thirteen documented tooling entries; no dependencies changed. These checks do not establish real-user privacy compliance or hallucination-free analysis.

- [DOCX download, content verification, formatting, privacy, and limits](docs/docx-export.md)
- [Controlled improvement, patch safety, draft lifetime, and limits](docs/resume-improvement.md)
- [Concise chronological human prompt log](CHAT_LOG.md)
- [Results dashboard, job extraction, matching methodology, and limits](docs/results-dashboard.md)
- [AI integration, official sources, security/privacy limits, and verification](docs/ai-integration.md)
- [Deterministic analysis API and thresholds](docs/deterministic-analysis.md)
- [Extraction limits and deployment requirements](docs/extraction.md)
- [Architecture](docs/architecture.md)
- [Implementation checklist](docs/implementation-checklist.md)
- [Dependency checks and audit notes](docs/dependencies.md)
- [Engineering and Git safeguards](CLAUDE.md)
- [Design system](docs/design-system.md)
- Historical records: [foundation](docs/verification.md), [Phase 1](docs/phase-1.md)

Git commits/pushes follow the review and secret-handling safeguards in `CLAUDE.md`. Implementation completion is not a claim that changes have been pushed.
