# Foundation verification (historical)

This records the initial foundation milestone. See [Phase 1 implementation and verification](phase-1.md) for the current application interface, test counts, and limitations.

Date: **2026-11-06**. Local environment: Windows 11 / Git Bash, Node 24.20.0, npm 11.19.0.

## Inspection

- Initial working directory was `C:\Users\aasha\ConsultaddExperiment\resumeIQ`, empty and not a Git repository.
- Checked directory contents before writing; no pre-existing project files were overwritten.
- No `.env`, `.npmrc`, `package.json`, or `CLAUDE.md` in the project or the two inspected parent directories.
- No matching Gemini/Google/Supabase/Next environment variable names in the process. Values were not printed.
- No credentials required for these checks; no Gemini or Supabase requests made by application code.

## Results

| Check | Outcome |
| --- | --- |
| `npm run lint` | Passed with zero warnings |
| `npm run typecheck` | Passed, including Next route generation |
| `npm test` | 10 tests passed |
| `npm run build` | Passed; home and not-found pages prerendered |
| `npm run test:e2e` | 6 passed: 3 scenarios each on desktop/mobile Chromium |
| `npm run check` | Passed the complete lint → types → unit → build → E2E sequence |
| Separate `npm run dev` and direct browser interaction | Passed; HTTP 200 on desktop and mobile, navigation link clicked, no console/page errors |
| Desktop/mobile screenshot inspection | Passed; text, preview notice, mode descriptions, and responsive layout visible |
| `npm run test:e2e:dev` | 6 passed on desktop/mobile Chromium; final `npm run check && npm run test:e2e:dev` exited 0 |
| `npm ls --depth=0` | Passed; no missing/invalid direct dependency entries |
| `npm audit --omit=dev` | 0 reported vulnerabilities |
| Full `npm audit` | Nonzero exit: 13 development-tooling affected entries (2 low, 11 moderate), documented in dependencies.md |

Unit coverage: required Gemini variables, malformed/missing input, whitespace normalization, stripping unrelated fields, and redacted errors. Tests use synthetic strings and make no network requests.

Browser coverage: visible foundation notice, both planned review modes, absence of file-upload controls, real in-page navigation, no horizontal overflow, keyboard skip link, actual 404 response, and console/page errors. This is a foundation smoke suite, not a comprehensive accessibility audit or product-workflow test suite.

Screenshots from the separately launched dev app are saved locally in `artifacts/foundation-desktop.png` and `artifacts/foundation-mobile.png` (ignored by Git). Both were visually inspected. The development-only Next indicator appears in those screenshots and is not part of the production UI.

## Issues caught and corrected

1. Initial lint stopped on a plain internal home anchor and anonymous PostCSS default export. Fixed by using Next `Link` for home navigation and a named config export.
2. First full browser run passed four tests but failed both navigation tests: the Base UI-rendered anchor exposed button rather than link semantics. Replaced it with a real anchor styled with shadcn's `buttonVariants`. All six production browser tests then passed.
3. Vitest warned about ESM config in a CommonJS package. Added `"type": "module"`; the subsequent run passed without that warning.
4. Chromium download initially encountered `ECONNRESET`; Playwright retried automatically and completed installation successfully.
5. Generated Google Font loading was replaced with a system font stack to avoid a build-time network dependency.
6. Generated shadcn CLI dependency was moved to devDependencies; full audit findings remain, but production-only audit is clean. No force fixes were applied.
7. An immediate production-to-dev E2E handoff initially failed because port 3100 was still in use during teardown. The test configurations now invoke Next directly without npm wrappers and use separate ports (3100 production, 3101 dev). The separately launched npm dev task also left a Windows child listener after task shutdown; its ownership was verified and that specific child was stopped. Do not assume stopping an npm wrapper always stops its Next child on Windows.

Next.js generated `AGENTS.md` and `next-env.d.ts` during startup/type generation; the former is retained as framework guidance and the latter is ignored/generated.

## Not verified / not implemented

No upload/extraction, AI analysis, editing, export, real-provider credentials/model availability, Supabase, deployment, parser isolation, public abuse controls, or data-retention behavior has been implemented or tested. No Firefox, WebKit, physical mobile device, or hosted environment was tested. No claim of a finished product or clean full security audit is made.

The separate development server used for screenshot inspection was stopped after use, including its verified leftover Windows child process. Playwright manages its own test servers. See README for starting a fresh local session.

For repeatable agent-driven visual checks, consider `/run-skill-generator` to capture the verified Windows startup/cleanup and desktop/mobile screenshot procedure as a project skill.
