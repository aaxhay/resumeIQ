# ResumeIQ

ResumeIQ helps people inspect resume text, understand evidence-backed feedback, and improve a separate draft before downloading an editable DOCX. It supports **General Review** and **Job-Specific Review**, with no account required for the core workflow. No ATS scores, hiring guarantees, invented results, or automatic edits.

**Deployment status:** Vercel deployment is blocked awaiting operator login; no deployment URL or hosted success is established. The target is a **protected, synthetic-only demo**, not unrestricted public production. Local packaging and limits passed verification; Linux/Vercel behavior still requires hosted checks. See [deployment instructions and release checks](docs/deployment.md) and the [presenter demo script](docs/demo-script.md).

## Features

- Responsive light/dark themes with an OS-aware, keyboard-accessible toggle; modern system typography and reduced-motion-aware CSS depth/animation. Only the color preference is stored locally.
- Upload a text-based PDF/DOCX or paste text; inspect, edit, and explicitly confirm extracted text.
- Run explainable local text checks without an API key or AI transfer. These rules do not compare a job description.
- Optionally request Gemini feedback after reviewing editable, minimized previews and giving explicit consent. Job-specific results include requirement-level evidence and unassessed items.
- Accept, reject, or manually edit recommendations in a separate, memory-only draft. Undo accepted edits or restore original content; the confirmed original stays unchanged.
- Download the current improved preview as a clean DOCX, verified by server-side generation and text re-extraction. Only accepted edits are exported; original layout is not reproduced.
- Optional Supabase accounts store separately consented, minimized summaries and limited excerpts, not files or editable workspaces. History stays disabled until schema and scheduled cleanup are verified.

## Technology and architecture

Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, Base UI/shadcn primitives, and Lucide SVG icons. System fonts require no remote build-time fetch. Server integrations use `@google/genai`, Supabase Auth/Postgres, bounded PDF/DOCX parsers, and `docx`; tests use Vitest, embedded PostgreSQL/PGlite, and Playwright Chromium. Exact versions are pinned in `package.json` and `package-lock.json`.

```text
src/app/                       Pages and thin Node-runtime API routes
src/components/                Shared UI, navigation, landing sections
src/features/review/           Setup, confirmation, feedback, editing, export UI
src/features/saved-reviews/    Optional account and consented summary history
src/lib/                      Pure contracts, analysis, matching, editing, limits
src/server/resume-processing/  Bounded, isolated PDF/DOCX extraction
src/server/ai/                 Provider interface, Gemini adapter, output validation
src/server/documents/          DOCX generation and round-trip validation
src/server/supabase/           Verified identity, ownership checks, summary access
supabase/                     Migration, RLS, retention references
tests/                        Unit/integration and browser/API tests
```

Dependencies flow from UI/routes through focused application logic to server adapters. Pure analysis/editing modules do not depend on React, providers, I/O, clocks, or randomness. Server-only credentials never enter browser modules. See [architecture](docs/architecture.md) and [engineering safeguards](CLAUDE.md).

## Local setup and environment

Use **Node 24.x and npm 11.x** (previously verified on Node 24.20.0 / npm 11.19.0).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Extraction and local checks need neither a database nor an API key. To configure optional integrations, copy `.env.example` to ignored `.env.local` **without overwriting existing settings**.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Server-only provider credential; leave empty to disable AI |
| `GEMINI_MODEL` | Explicit model ID; verify availability for the intended account |
| `GEMINI_DATA_POLICY` | Keep `synthetic-only` for this demo |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional public-by-design publishable key, never a secret/service-role key |
| `SUPABASE_HISTORY_ENABLED` | Keep `false` until migration and scheduled retention are verified |

Never commit secrets, put Gemini credentials in `NEXT_PUBLIC_*`, or send them in chat. Missing configuration disables the corresponding optional capability rather than supplying fake results. The known hosted Supabase schema was absent at the last check; enabling a flag alone does not fix this.

**Synthetic-only means genuinely fictional documents**, not redacted real resumes. Best-effort contact minimization is not anonymity. `paid-reviewed` is an operator attestation requiring reviewed billing/terms, region and adult-access restrictions, privacy disclosures, and deployment safeguards; it is not automatically verified. See [AI policy and limitations](docs/ai-integration.md) and [Supabase setup](docs/supabase.md).

## Development and testing

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development on port 3000 |
| `npm run build` / `npm run start` | Build / serve production application |
| `npm run lint` / `npm run typecheck` | Zero-warning ESLint / Next route types and strict TypeScript |
| `npm test` / `npm run test:watch` | Unit/integration tests / watch mode |
| `npm run test:e2e` | Production desktop/mobile browser/API tests; requires a build |
| `npm run test:e2e:dev` | Dedicated development-server browser tests |
| `npm run check` | Lint → types → unit tests → build → production E2E |
| `npm run test:ai:live` | Separate, potentially billable live Gemini evaluation using synthetic fixtures |
| `npm run test:worker:package` | After build: verify isolated extraction using only traced files outside the project |
| `npm audit` / `npm audit --omit=dev` | All / runtime dependency advisory inspection |

Install Chromium with `npx playwright install chromium` (Linux CI may need `--with-deps`). Playwright owns ports 3100 and 3101; run production and development E2E sequentially. Stop a manual dev server before dev E2E because Next uses a project-wide lock. Do not reuse an arbitrary running server.

Ordinary tests mock provider/Auth boundaries while exercising real document extraction/export; embedded database tests do not verify hosted Supabase. A passing build or mocked journey is not live-model access, factuality, or deployment proof.

**Latest local verification (2026-11-07):** the rebuilt full gate passed **838 unit/integration tests and 168 production desktop/mobile browser/API tests**, lint, strict types, and build. Projectless traced-worker checks passed paste/PDF/DOCX extraction on Windows. This includes dark theme/motion, notice cleanup, top-of-page download completion, retained drafts, browser-Back confirmation and evidence/authentication regressions. See the [final review and repair report](docs/final-review-followup.md) for fixes, intermediate failures and two remaining medium-priority AI false-rejection cases.

The separate earlier live Gemini evaluation **failed overall: 8/9 synthetic cases passed fixture checks; the weak-resume case returned `INVALID_RESPONSE`**. That failure remains unresolved and was not rerun. These deterministic tests do not establish live-provider reliability or universal factuality. Earlier milestones remain in the [QA/security report](docs/qa-security-review.md).

## Vercel demo setup

1. Complete Vercel login as the operator; choose the intended team/project. Never share a login token in chat.
2. Configure a Next.js project with **Node 24.x**, the lockfile-based install, and `npm run build`. Review the worker-source/runtime dependency tracing requirements in [deployment.md](docs/deployment.md); a local build alone does not verify serverless packaging.
3. Configure environment values in the intended deployment scope, retain `synthetic-only`, and leave history disabled. Set up and verify deployment protection **before exposing credentialed AI routes**.
4. After authorization and a successful local gate, deploy and smoke-test the actual protected URL: extraction, cancellation/errors, consented synthetic review, controlled editing, and real DOCX download. Verify access restrictions and platform limits separately.

These are operator steps, **not completed deployment claims**. Do not turn the demo into public production without distributed abuse/cost controls, provider budgets, parser containment, and applicable privacy/retention verification.

## Limits and data handling

- Deployment preparation targets **4 MiB uploads and a 4 MiB generated DOCX cap** (the UI labels upload size “4 MB”) to leave room below platform payload limits; local checks passed, but hosted packaging/limit verification is pending. PDFs remain limited to 20 pages, extracted/editor text to 80,000 characters, Gemini resume previews to 30,000, and job descriptions to 50–10,000. No silent truncation.
- No OCR, legacy `.doc`, PDF export, original-layout preservation, unrestricted generative rewriting, or factual/hiring-suitability certification. DOCX text in unsupported structures can require paste fallback.
- Extraction sends input to this application's server for in-memory processing, not to Gemini. Only explicit AI consent sends the reviewed previews to Google. Export sends the improved text to this application's server, not Google.
- Drafts live only in page memory. Download/copy before leaving; saved summaries cannot restore drafts. Reloading clears the workspace, not downloaded files, already transferred provider data, or saved summaries.
- Optional history retains only the previewed summary/excerpts for up to 30 days, with ownership isolation and earlier deletion. Hosted migration, cleanup, and live Auth remain unverified.
- Local request/concurrency guards are not distributed rate limits or monetary budgets. Cancellation may stop browser waiting without preventing provider completion or charges. Tooling advisory exceptions remain documented; no forced dependency fixes were applied.

## Further reading

[Demo script](docs/demo-script.md) · [Deployment](docs/deployment.md) · [Extraction](docs/extraction.md) · [Local analysis](docs/deterministic-analysis.md) · [AI integration](docs/ai-integration.md) · [Results and evidence](docs/results-dashboard.md) · [Controlled improvement](docs/resume-improvement.md) · [DOCX export](docs/docx-export.md) · [Supabase](docs/supabase.md) · [Dependencies](docs/dependencies.md) · [Design system](docs/design-system.md) · [Prompt history](CHAT_LOG.md)
