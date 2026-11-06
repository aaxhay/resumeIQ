# Controlled resume improvement

## Scope and workflow

After a validated general or job-specific Gemini review, **Improve this resume** opens a separate browser-memory workspace. It reuses the review already received: accepting, rejecting, manually editing, undoing, and restoring make **no extra provider calls**. There is no new rewriting endpoint, rich-text editor, or persistent history. The subsequent [DOCX export milestone](docx-export.md) adds an explicit download of the current preview without another AI call.

Each evidence-backed finding has one uniquely identified suggestion containing its finding ID, exact original text, proposed text, reason, sent-preview evidence reference, status, and original-coordinate target candidates. Findings without source evidence are listed as skipped rather than assigned invented text. When no safe AI wording exists, the original is visibly labeled an editable starting point, not a generated improvement.

The comparison shows original/suggested wording, recommendation, exact evidence, selected original location/context, and textual status. Users can save a manual suggestion without applying it, accept it separately, or reject it. Empty/whitespace-only edits and edits over 2,500 characters are rejected. The improved-resume preview is read-only plain text; only accepted changes appear there.

## Pure editing contract

`src/lib/resume-improvement/contracts.ts` contains strict Zod schemas and inferred readonly types. `editor.ts` has no React, provider, network, clock, randomness, or persistence dependency.

- `createImprovementSession(originalText, validatedReview, actualSentPreview)` validates input and exact cited evidence. Only this constructor throws on invalid input.
- `findTargets(originalText, quote)` finds exact UTF-16 occurrences, including overlapping occurrences, with one-based lines/context.
- `chooseTarget(state, id, start)` selects an explicit original-coordinate occurrence.
- `editSuggestion(state, id, text)` saves a user-authored suggestion with `manually_edited` status, not an applied patch.
- `acceptSuggestion(state, id, expectedRevision, expectedText?)` checks session integrity, revision, exact original/current target, and non-overlap before accepting.
- `rejectSuggestion(state, id)` never changes either resume version.
- `undoLatestEdit(state)` removes the most recently accepted patch and restores that suggestion’s pre-accept draft/status. Later unrelated manual edits/rejections survive.
- `restoreOriginal(state)` removes every accepted patch and clears accepted-edit history. Other manual drafts/rejections remain. Accepted suggestions return to their pre-accept drafts/statuses.
- `replaceAiSuggestion(state, id, rewrite, expectedRevision)` is a guarded library boundary for future integrations; the UI does not call a standalone rewrite service. It rejects stale results, source mismatches, and attempts to overwrite manual drafts.
- Mutations return `{ok:true,state}` or `{ok:false,error}`. `applicability` supplies acceptance availability and a safe explanation.

Statuses are `pending`, `accepted`, `rejected`, and `manually_edited`. Accepted/rejected suggestions are locked. Undo or restore unlocks accepted suggestions; restarting the workspace starts fresh decisions, including rejected suggestions. History is an ordered list of active accepted patches, not a permanent audit log.

## Location and conflict safety

The immutable baseline is the **confirmed editor text**, not the file’s original bytes/layout and not the minimized provider preview. Contact removal and manual preview edits may shift positions or remove passages. Preview offsets are evidence references only: they are never used as patch offsets.

A unique exact original match is automatically anchored. Repeated exact matches require an explicit occurrence choice, with line/character/context information. Missing or redacted source passages stay visible but cannot be applied. Excessively repeated targets are capped and blocked rather than exposing a huge or incomplete location selector.

Accepted patches keep immutable-original UTF-16 coordinates. Rendering sorts them and reconstructs the draft from the baseline; it does not call `replaceAll` or search for the first matching text. Overlapping/contained patches conflict; adjacent/non-overlapping patches in the same section are allowed. Earlier variable-length changes cannot move a later patch to the wrong content. Acceptance rechecks the original slice, the shifted current draft slice, and the expected revision/text. Failures leave state untouched.

Limits: original 80,000 characters; actual sent preview 30,000; at most 12 suggestions and 12 active accepted edits; each edited passage at most 2,500 characters. No silent document truncation.

## Facts and manual control

Exact substring shortening alone does **not** preserve facts: deleting “not,” a date, a metric, a title qualifier, or attribution can change meaning. Therefore the editing engine has a deliberately tiny AI transformation allowlist: unchanged text, surrounding whitespace/leading bullet-marker removal, and removal of the leading filler “Successfully ” (case-insensitive). It does not permit unrestricted AI paraphrasing, new technologies, new results, or factual deletion.

Other supplied AI rewrites are withheld from the actionable suggestion with a visible safety note; its starting text remains the original. This check is stricter than the existing dashboard’s extractive-rewrite validation. Dashboard suggestions remain unapplied advice, not an assertion of semantic equivalence. The small allowlist is not a general factual-equivalence or truth-verification system.

Manual text is explicitly user-authored and not AI-verified. Users are told to preserve titles, dates, metrics, technologies, and meaning, and to supply truthful audience/responsibility/result/measurement/tool details only where relevant to the recommendation. No automatic filling of missing facts takes place. A saved manual draft must still be accepted separately.

## Lifetime, reset, and privacy

`ReviewSetupForm` owns the workspace independently of the confirmed analysis subtree. Changing source text, mode, job description, provider preview, or consent clears old analysis as before but does not silently destroy the existing improvement draft. The workspace prominently identifies its original snapshot and never writes back to the setup editor. No edit is automatically re-reviewed or re-sent to Google.

Opening a new workspace while one exists requires explicit replacement confirmation; cancelling retains all existing local work. Restore also requires confirmation. **Start over** requires confirmation when a workspace exists and then clears setup, workspace, and pending replacement. Reload/closing or navigating away loses in-memory work; a browser `beforeunload` warning is registered while the workspace is mounted, but browsers may suppress it and client-side navigation does not trigger it. Copy text or download the improved DOCX before leaving. No localStorage, database, or document logging is used. The subsequent export milestone adds a server route and promotes `docx` to a runtime dependency; its explicit action transfers the current improved text to this application's server, not to Google.

`CHAT_LOG.md` records concise human development requests, including reconstruction labels for earlier history. It is a maintained project document, not a runtime transcript or user-document log.

## Verification

Final `npm run check` passed on 2026-11-06: **526 unit/integration tests in 18 files**, **80 desktop/mobile browser/API tests**, lint with zero warnings, strict TypeScript, and production build. This includes **44 focused editing-engine cases** and **12 new browser executions** (six scenarios across desktop/mobile). Both general PDF and job-specific DOCX journeys reach the editing workspace through actual extraction and semantically validated mocked reviews. Coverage includes every requested editing action, source/preview separation, duplicate/missing/redacted targets, conflicts, stale revisions, same-section patches, restore/undo history, draft retention, replacement/reset confirmation, keyboard focus, and 320px overflow. Earlier 482-unit/68-browser recovery results are historical.

An initial full run passed lint, strict types, 523 unit tests, and production build, but new browser scenarios exposed missing focus restoration after saving/cancelling manual wording. The run was stopped after the fix so the final gate could rebuild and test the current code; its partial browser results are not counted as a pass. Focus now returns in an effect after the edit button has been re-enabled. Additional signed-metric/line-boundary unit cases and confirmed Start over browser coverage were added before the rerun.

A fresh synthetic PDF → actual Gemini → improvement browser smoke attempt returned the existing safe `PROVIDER_ERROR` before reaching the workspace. No automatic retry or extra paid request was made, no response was substituted, and no feedback was shown. This attempt is a failure, not live improvement verification. The provider implementation and HTTP contract were not changed by this milestone; prior live review successes remain historical. Deterministic browser tests mock AI reviews while exercising actual upload/extraction and the real editing UI; these must not be described as live Gemini tests.

Final diff whitespace checks passed. A private credential comparison and common credential-pattern scan covered 15 changed/new project files and 12 production browser assets with zero matches. No dependencies changed; dependency audits were not rerun for this milestone. No changes were committed or pushed: Git author identity remains the placeholder `Your Name <you@example.com>`.

A separate development-server browser run with an explicitly mocked, semantically validated review passed real PDF upload → confirmation → workspace → manual save/accept → undo → provider-preview change, retaining the draft and original. It made exactly one mocked review POST, had no page errors, and checked mobile overflow. Desktop (1280px) and mobile (390px) screenshots were visually inspected: comparison columns stack on mobile, textual statuses are clear, and evidence/target/history controls remain readable. This is actual application interaction with mocked feedback, not live provider success.
