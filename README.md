# ResumeIQ

An AI-powered resume review platform in development. **Upload, extraction, and editable text confirmation are implemented.** Upload a PDF/DOCX or paste your resume, choose a review focus, inspect and correct the text, then confirm it. AI analysis, feedback, improvements, and export are not implemented.

## Product target

- **General Resume Review:** actionable feedback without a job description.
- **Job-Specific Review:** compare a resume with a supplied job description.
- **Required journey:** Upload Resume → Choose Review Mode → Confirm Extracted Text → Analyze → Review Feedback → Improve Resume → Export DOCX.

The 1–2 day MVP prioritizes this complete journey. Accounts, history, billing, OCR, and PDF export are out of scope.

## Local setup

Verified environment: Windows 11 / Git Bash, Node **24.20.0**, npm **11.19.0**. Use Node 24.x and npm 11.x; `.nvmrc` records the verified Node patch. No database or API credentials are needed to run the foundation.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000** for the landing page, or **http://localhost:3000/review** for the workflow. Choose a PDF/DOCX up to **5 MiB**, or paste text. Select a review mode and choose **Extract resume text** / **Prepare pasted text**. Inspect and edit the result, then **Confirm resume text**. Job-specific mode requires 50–10,000 characters of job-description text, which stays in the browser. Extraction sends the resume to this application's server for in-memory processing, without AI or application storage. Use `Ctrl+C` to stop the server.

For a production run:

```sh
npm run build
npm run start
```

The project uses a system font stack, so builds do not need to fetch Google Fonts. Run from the project root and retain the full source tree and runtime dependencies: the isolated parser executes owned TypeScript source with Node 24. `.next`-only, standalone, Edge, and serverless packaging are not verified. See [extraction limits and deployment requirements](docs/extraction.md).

### Environment configuration

`.env.example` documents `GEMINI_API_KEY` and `GEMINI_MODEL`. When the Gemini milestone begins, copy it to `.env.local` and set both values. Do not put secrets in `NEXT_PUBLIC_*` variables or commit `.env.local`.

Configuration is validated only when the future integration requests it. The preview makes no AI calls, and a successful build is not proof of valid provider credentials. No default model is silently selected. Supabase is intentionally not configured or installed.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server on port 3000 |
| `npm run build` | Compile and type-check the production application |
| `npm run start` | Serve an existing production build |
| `npm run lint` | ESLint with zero warnings allowed |
| `npm run typecheck` | Generate Next route types and run strict TypeScript |
| `npm test` | Run unit tests once |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Test the production server in desktop/mobile Chromium |
| `npm run test:e2e:dev` | Test the actual development server |
| `npm run check` | Lint → typecheck → unit tests → build → production E2E |
| `npm audit --omit=dev` | Inspect production dependency advisories |

Install the browser before running E2E tests:

```sh
npx playwright install chromium
npm run check
npm run test:e2e:dev
```

Production E2E requires `npm run build` first unless using `npm run check`. Playwright manages dedicated servers on **127.0.0.1:3100** (production) and **127.0.0.1:3101** (development), invoking the Next CLI directly without an npm process wrapper. It does not reuse other processes. Run the production and dev E2E commands sequentially; stop a manually running dev server before running dev E2E because Next uses a project-wide dev lock. On Linux CI, browser system libraries may require `npx playwright install --with-deps chromium`.

## Structure

```text
src/app/                  Server-rendered landing and /review entry pages
src/components/landing/   Landing sections, separate from page composition
src/components/ui/        Customized shadcn button, card, textarea, notices
src/features/review/      Upload/editor UI, async state, validation, mode definitions
src/lib/resume/           Shared extraction contracts, limits, file screening
src/server/resume-processing/ Bounded requests, isolated extraction, normalization
src/lib/config/           Pure Zod configuration validator
src/lib/contracts/       Reserved shared API contracts
src/lib/utils.ts          Generated styling utility
src/server/config/        Server-only environment access
src/server/ai/           Reserved Gemini integration
src/server/documents/    Reserved DOCX export
src/server/data/         Reserved optional persistence
tests/unit/               Vitest tests
tests/e2e/                Playwright browser tests
docs/                     Architecture, dependency notes, checklist
```

Reserved boundaries contain explanatory README files, not fake implementations. Routes will remain thin; business logic, document processing, AI calls, and persistence will live in separate modules.

## Documentation

- [Engineering rules and agent instructions](CLAUDE.md)
- [Architecture and proposed API boundaries](docs/architecture.md)
- [Dependency-ordered implementation checklist](docs/implementation-checklist.md)
- [Compatibility checks, documentation sources, and audit notes](docs/dependencies.md)
- [Extraction workflow, limits, privacy, and verification](docs/extraction.md)
- [Historical Phase 1 implementation and verification](docs/phase-1.md)
- [Design system](docs/design-system.md)
- [Historical foundation verification record](docs/verification.md)

## Implementation status

Implemented: responsive landing page, accessible upload/paste workflow, server byte/signature validation, bounded PDF/DOCX extraction in a killable process, structure-preserving normalization, completeness warnings, editable text confirmation, review modes/job-description validation, cancellation/reset and stale-response handling. No permanent application storage or resume logging.

Not implemented: Gemini integration, feedback, improvements, DOCX export, authentication, persistence, OCR, or public deployment. Confirmation does not perform analysis or establish that the resume's facts are correct. Complex layouts may need manual correction.

Tests use synthetic documents and cover extraction failures as well as upload → inspect → edit → confirm. See `docs/extraction.md` for verification and limitations.

## Next blockers and decisions

1. Gemini API credentials, an explicitly selected available model, and quota/billing before live analysis testing.
2. Hosting selection and verified body-size, Node runtime, parser memory/time, and request-duration limits before accepting uploads publicly.
3. OS/container resource isolation and distributed upload rate limits before public release; provider consent/privacy and cost controls before AI integration.
4. Resolve or deliberately accept the documented development-tooling advisories and ESLint compatibility exception.

No existing files were overwritten during initialization: the directory was empty. No cloud resources were provisioned, and no Git commit or push was made.
