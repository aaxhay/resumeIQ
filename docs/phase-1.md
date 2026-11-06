# Phase 1 — Application foundation and UI

Historical milestone record. The current application adds server extraction and editable confirmation; see [extraction.md](extraction.md). Limits and unavailable-feature statements below describe Phase 1 only.

Implemented and verified on 2026-11-06. This phase supersedes the original static foundation preview; it does **not** implement analysis or document extraction.

## Pages and behavior

### `/` — Landing

Server-rendered product positioning, primary **Review My Resume** CTA, general/job-specific explanations, planned feature/workflow overview, and factual privacy messaging. CTA opens `/review`; navigation links target real sections. Reusable header/footer, original green/ink visual identity, no remote fonts or copied branding, and no simulated results, metrics, or testimonials.

### `/review` — Review entry and preferences

- PDF/DOCX native picker and drag/drop; one file at a time, 4 MiB maximum (displayed as 4 MB).
- Rejects empty files, unsupported extensions, conflicting MIME types, and mismatched basic headers. Handles absent/generic browser MIME metadata. Only the first five bytes are read for screening.
- Selected filename/size, replacement/removal, real asynchronous checking, disabled/loading states, specific errors, and recovery.
- Native radio-card group for general and job-specific review; pointer, touch-sized targets, and keyboard arrows.
- Conditional job-description textarea, visible label/help, count, and validation. Requires 50 characters after trimming; raw input may not exceed 10,000. Invalid input is not silently truncated. General mode does not require/include job text in its validated contract.
- **Check review setup** validates current preferences and displays an actual local summary. It explicitly says the document has not been uploaded, parsed, or analyzed. There is no fake Continue/Analyze control.
- Changing the file, mode, or text invalidates the summary. Mode changes preserve the user's job-description draft in page memory. Clear setup/reload discards state.
- Stale file-read completions cannot restore a cleared or replaced selection. Canceling the system file picker does not discard a previous valid file.

## Component and module boundaries

- `src/app/page.tsx`, `src/app/review/page.tsx`: server-rendered page composition and metadata.
- `src/components/site-header.tsx`, `site-footer.tsx`: shared navigation/chrome.
- `src/components/landing/`: static hero, review overview, workflow, and privacy sections.
- `src/components/ui/`: customized shadcn Button/buttonVariants plus focused Card, Textarea, and Notice primitives.
- `src/features/review/components/`: ResumeUpload, ReviewModeSelect, JobDescriptionField, SetupConfirmation, and the ReviewSetupForm client boundary.
- `src/features/review/use-review-setup.ts`: state transitions, async race protection, reset, and validation orchestration.
- `src/features/review/validation.ts`: pure Zod rules and bounded local file checks.
- `src/features/review/review-options.ts`: one source of mode labels/descriptions, shared by landing and form.

No new dependencies were installed. Existing npm/Node pins and the lockfile remain unchanged. Server integration boundaries remain reserved.

## Design and accessibility

See [design-system.md](design-system.md) for tokens, typography, spacing, radii, breakpoints, and control states. All inputs have associated labels/help; native radio semantics support keyboard selection; focus outlines and skip-to-content links are visible. Error submission focuses the job field, success focuses the summary, and reset/removal returns focus to the picker. Reduced motion is respected. No accessibility certification is claimed.

## Verification

Final `npm run check` exited 0:

| Check | Result |
| --- | --- |
| ESLint | Passed, zero warnings |
| Strict TypeScript and route types | Passed |
| Vitest | 38 tests passed across 2 files |
| Production build | Passed; `/`, `/review`, and not-found prerendered |
| Production Playwright | 20 tests passed across desktop/mobile Chromium |
| Live dev app | Navigated landing → review; selected a synthetic PDF; selected job-specific mode; entered job text; checked setup |
| Responsive checks | Automated 320px/768px overflow checks; direct browser interaction at 1440px, 768px, and 390px |
| Console/runtime errors | None in the exercised live flows |
| Visual inspection | Desktop review, mobile review, desktop landing, and tablet landing screenshots inspected |

E2E covers navigation, keyboard skip/radio controls, both modes, file and description errors, drop/replacement/removal, reset, pending-read cancellation, stale-state invalidation, refresh reset, 404, and no upload POST/PUT/PATCH requests during setup. Synthetic header fixtures test **screening**, not successful parsing of genuine PDF/DOCX documents.

The first browser run exposed the visually hidden radio target being covered by its label and alert selectors also matching Next's route announcer. Radio inputs now cover their card hit area; tests scope validation alerts to the form. The rerun passed. A final regression check also verifies focus recovery when clearing a pending file check.

Screenshots are local, ignored artifacts: `artifacts/phase1-landing-{desktop,tablet,mobile}.png` and `artifacts/phase1-review-{desktop,tablet,mobile}.png`. The existing dev server remains available on port 3000 for inspection. The dedicated `test:e2e:dev` command was not rerun in this phase; the actual development app was exercised directly instead.

## Outstanding limitations and next work

1. No server uploads, text extraction/confirmation, AI calls, editing, or DOCX export. These remain deliberately out of scope.
2. Header/MIME/extension screening does not prove document validity or safety. A ZIP renamed DOCX can pass the basic container header; protected, corrupt, or scanned PDFs may also pass. Full parsing, DOCX structure/ZIP expansion validation, resource limits, and server validation belong in the next milestone.
3. Review data is only held in page memory. No database/localStorage/sessionStorage, no durable drafts, and no cross-tab synchronization. Privacy claims are limited to current behavior.
4. Tested in Chromium emulation, not physical devices, Firefox, WebKit, or assistive-technology hardware/software.
5. The prior development/build audit exceptions and ESLint compatibility exception remain documented in `dependencies.md`. Dependencies did not change; the audit was not rerun in this UI phase.
