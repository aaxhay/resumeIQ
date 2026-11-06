# ResumeIQ

A resume-review application with **PDF/DOCX extraction, editable confirmation, local deterministic checks, and optional Gemini AI feedback**. General review and job-specific evidence comparison are implemented. No ATS scores, hiring guarantees, automatic resume changes, or export.

## Local setup

Verified on Windows 11 / Git Bash, Node **24.20.0**, npm **11.19.0**. Use Node 24.x and npm 11.x. No database is required. Extraction and deterministic checks work without an API key.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000/review**. Upload a PDF/DOCX up to 5 MiB or paste text; select a mode; extract/prepare; inspect and edit; confirm. **Run text checks** executes local rules without provider calls. For optional AI feedback, review the minimized provider previews, remove unnecessary personal information, give explicit consent, and choose **Send previews to Gemini**.

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
src/lib/config/             Pure configuration validation
src/server/resume-processing/ Bounded isolated PDF/DOCX extraction
src/server/ai/               Provider interface, Gemini adapter, validation, cost guards
src/server/config/           Server-only environment access
src/server/documents/        Reserved DOCX export
src/server/data/             Reserved optional persistence
scripts/verify-gemini.ts     Explicit synthetic live-provider verification
```

The rest of the application uses `ResumeAiProvider`, not Gemini SDK types. Model output is checked by Zod plus exact citations, full area coverage, conservative job-evidence rules and numeric guards. Optional rewrites are extractive shortening only; no new facts or words are added. Exact citations do not prove semantic or factual truth. Review all AI advice before use.

## Current limits and release blockers

- English-oriented text analysis, not original-layout assessment, fact checking, or exhaustive job coverage.
- No accounts/history, database, OCR, legacy DOC, billing UI, public deployment, full generative rewriting, or DOCX export.
- AI requests have deadlines, duplicate suppression, local concurrency and request caps. These are **not distributed abuse protection or monetary budgets**; do not expose the endpoint publicly until authenticated/trusted ingress, distributed controls, provider budget limits, and deployment behavior are verified.
- Local full-project Node execution is supported. Keep worker sources and runtime dependencies; `.next`-only, standalone, Edge, and serverless packaging are not verified. Builds use system fonts without external font fetching.
- Existing tooling advisories and compatibility exceptions are documented; no forced dependency fixes.

## Documentation and verification

Final quality gate: **366 unit/integration tests**, **62 desktop/mobile browser/API tests**, lint, strict TypeScript, and production build passed. Both review modes also passed with actual Gemini through the browser using synthetic data; separate live resume/JD injection checks passed. Runtime audit has zero findings; the full audit retains thirteen documented tooling entries. These checks do not establish real-user privacy compliance or hallucination-free analysis.

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
