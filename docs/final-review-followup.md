# Final review and repair follow-up — 2026-11-07

## Scope and method

Inspection preceded application edits. An independent, read-only review covered the changed implementation and adjacent execution paths, prioritizing privacy, evidence validation, extraction/API boundaries, and account isolation. Concrete high-priority findings were reproduced before correction. This is not a certification of the whole application, hosted configuration, semantic AI correctness, or all possible attacks. The earlier broader QA record remains in [qa-security-review.md](qa-security-review.md).

No critical finding was established. Three high-priority findings were reproduced and fixed. Five medium-priority findings were identified; three were fixed and two fail-closed reliability defects remain. Two low-priority code findings were fixed. The requested UI changes and an early-hydration defect discovered during regression testing were also corrected.

## Ranked findings and outcomes

Locations refer to the current implementation; grounding helpers moved from `src/server/ai/grounding.ts` to `src/lib/ai-review/grounding.ts`.

| Priority | File / location | Root cause and application impact | Correction / outcome |
| --- | --- | --- | --- |
| High | `src/server/ai/validate.ts`, job-match citation checks | The model could quote `Java` from `JavaScript` in the JD. Boundary checking only the shortened quote accepted an invented requirement when the resume contained Java. Reproduced acceptance. | **Fixed:** resolve quote boundaries in the original source before checking its requirement. Regressions include Java/JavaScript, C/C++, ASP.NET/.NET and cropped instruction evidence. |
| High | `src/server/ai/validate.ts`, affirmative match evidence; `src/lib/ai-review/grounding.ts`, `evidenceContexts` / `affirmativeResumeSource` | An exact substring could omit the `No` from `No Kubernetes experience.` and be accepted as affirmative support. Reproduced acceptance. | **Fixed:** inspect enclosing source sentences for recognizable negation/instructions; retain only affirmative citations for supported/partial matches and positive prose checks. Test shortened negatives/instructions and a later genuinely affirmative duplicate. This remains a bounded lexical check, not semantic entailment. |
| High | `src/components/review-exit-link.tsx`; review entry links in landing hero, site header and account page | Client-side entry created a same-document history path; browser Back unmounted the memory-only workspace without invoking `beforeunload`. Reproduced landing navigation, no dialog and lost workspace. | **Fixed:** native full-document links on entry and exit preserve the existing unload warning; no history trap or persistence added. Browser regression dismisses the warning, verifies accepted/unsaved edits remain, then accepts a deliberate exit. Browser/OS termination can still bypass unload warnings. |
| Medium | `src/app/api/account/route.ts`, POST admission; `src/server/supabase/guard.ts` | The authentication budget was correctly delayed until validation, but so was resource admission. Stalled bodies were outside the four-operation bound. | **Fixed:** acquire a resource slot before reading; charge the authentication budget only after validation; release on all exits and cancel unread bodies. Four stalled streams block a fifth request, abort releases slots, invalid bodies do not spend Auth allowance, and exhausted allowance does not leak a slot. These are process-local controls only. |
| Medium | `src/lib/ai-review/grounding.ts`, candidate technology checks | `The job does not require Kubernetes and you have Kubernetes expertise.` passed for a resume without Kubernetes because the job-negative exemption covered the candidate assertion too. Reproduced. | **Fixed:** candidate assertions are checked independently of the job-negative exemption. Supported candidate evidence remains accepted. |
| Medium | `src/lib/ai-review/grounding.ts`, `numbers` | `twenty-five years` was parsed as `five years`, accepting an invented duration when only five years was supplied. Reproduced. | **Fixed:** match complete bounded English compound quantities; hyphenated, spaced and hundred/and forms have positive and negative regressions. This is not universal number-language understanding. |
| Medium | `src/lib/ai-review/grounding.ts`, `explicitCandidateFacts` | Employer extraction extends through the following predicate. With `Developer, Fictional Data Lab` and `Built Python tooling`, truthful `You worked at Fictional Data Lab building Python tooling.` is rejected because the entire suffix is treated as an employer. Reproduced `unsupported-prose-claim`. | **Remains:** bounded employer/predicate separation needs additional adversarial tests. Recommended follow-up: source-span-aware attribution without accepting arbitrary employer-name prefixes or unsupported adjacent predicates. No broad weakening was applied. |
| Medium | `src/lib/ai-review/grounding.ts`, `usableSource` / prose technology checks | Filtering negated experience from affirmative evidence also rejects truthful discussion such as `The resume explicitly says there is no Kubernetes experience.` when that is exactly the source meaning. Reproduced `unsupported-prose-claim`. | **Remains:** distinguish negative-evidence description from positive candidate attribution, including mixed-clause adversarial tests. Keep fail-closed behavior until that distinction is verified. |
| Low | `src/lib/ai-review/grounding.ts`, numeric source sets | Every output clause rebuilt numeric sets from the same bounded source. | **Fixed:** precompute resume/job/combined sets once per field validation. No performance benchmark claim. |
| Low | Former `src/server/ai/grounding.ts`, module boundary | The new pure helper lacked the server-only guard required for server AI modules by `CLAUDE.md`. Blindly adding it would conflict with the intentionally pure test/evaluator interface. | **Fixed:** move credential-free, I/O-free lexical checks to the shared library and update validator, evaluator and test imports. Provider/configuration adapters stay server-only; no credentials or SDK types moved. |

### Other requested review categories

- **Architecture / abstractions:** preserve anonymous extraction/review/edit/export independently of optional Supabase; do not introduce a state library, generic repository or persistence to repair navigation. Native links simplify the previous client navigation wrapper.
- **Business logic:** the high/medium evidence findings above are concrete defects, not claims that lexical validation establishes factual truth.
- **TypeScript:** strict and `noUncheckedIndexedAccess` remain enabled; no `any` or rule suppression added. Moving the helper initially left one evaluator import unresolved; it was corrected before the successful final gate.
- **Privacy / user isolation:** no raw resume/draft persistence, provider logging, client ownership authority or privileged browser key was added. Existing owner/RLS, separate consent, account-change, failure and deletion tests remain. Hosted isolation is not established by mocked SDK or embedded database tests.
- **Extraction / API security:** no parser safeguards were removed. The actual PDF/DOCX/paste and invalid-input suites and projectless packaging smoke passed. Local Windows tracing is not Linux/Vercel sandbox verification.
- **Error handling:** unavailable history stays truthful, sign-out remains available, and actual save failures remain visible. No mock fallback replaces failed AI or document processing.
- **Duplicated logic / unnecessary abstractions:** no additional concrete defect requiring a rewrite was established. The shared pure checker is reused by validation and the bounded evaluator; neither is an independent semantic oracle.
- **Missing tests:** added source-context, compound-number, auth-body admission, browser-Back, hydration and scroll regressions; existing tests were retained.
- **Instruction compliance:** no secrets, disabled checks, forced dependency upgrades, assistant-created commit/push, or cloud provisioning in this repair. Existing commits made outside this assistant's tool calls were preserved.

## Requested notice and download behavior

- Removed the static `Text extraction is ready` announcement from `src/app/review/page.tsx`. The JavaScript fallback, real extraction errors, privacy guidance and consent controls remain.
- Replaced the long database migration/setup box in `src/features/saved-reviews/account-access.tsx` with a short unboxed availability statement. Actual `HISTORY_NOT_READY` save errors still report failure; unavailable save/consent controls stay hidden; no success is fabricated. Operational setup documentation remains in [supabase.md](supabase.md).
- Initial real export measured completion at scrollY **306 desktop / 391 mobile**, not zero. Returning focused the deep editor at **7141 / 9262**. Root cause: focus only scrolls enough to expose its target; it does not mean page top.
- `DownloadCompletion` now focuses without scrolling and explicitly scrolls to zero. Return-to-review preserves keyboard context without automatically jumping down the editor, then resets to zero. Both retain the mounted workspace, accepted edits, saved-but-unaccepted wording and unsaved buffers.
- Browser Forward initially overrode the reset with saved offsets (**486 / 514**). After a download, the same-document completion history uses manual scroll restoration; the prior mode is restored on component cleanup. No smooth motion, refresh, router replacement, or automatic saving was introduced.
- Full-document entry exposed an early file-selection/hydration race. Setup inputs are disabled until client handlers are ready. The delayed-script regression verifies the disabled/enabled transition and a real subsequent file selection. The Back test waits for an enabled file input, not a fixed delay.

## Verification

Final rebuilt command: `npm run check && npm run test:worker:package && node artifacts/download-followup/scan-configured-values.mjs` — **exit 0**.

- Zero-warning ESLint and strict TypeScript: passed.
- Unit/integration: **838 tests, 25 files passed**.
- Production build: passed.
- Production desktop/mobile browser/API: **168 passed**.
- Packaged isolated worker: pasted text, PDF and DOCX passed using only **2,684 traced files / 106 MiB**, Windows; temporary directory removed by the smoke command.
- Initial post-build configured-value scan: **zero matches** in its 3 changed/new files, 1 staged blob and 14 browser assets at scan time. Because commits were made outside this assistant during the work, a final broader scan used baseline `e933179`: **86 changed/new files, 1 staged blob, 14 browser assets, zero configured-value matches**. This checks configured values, not every possible secret or complete Git history; the existing index was not modified.
- Concurrent, unrelated `src/app/layout.tsx` favicon metadata, `src/app/icon.png`, and `APPROACH.md` edits were left untouched. The repair gate is not a separate acceptance test of those edits.
- Focused development verification: **141 unit tests** and **12 browser regressions** passed before the full gate.
- Actual-app visual smoke: real paste extraction and DOCX download with a clearly mocked, validated AI response; desktop 1280px and dark mobile 320px both measured **completion scrollY 0, return scrollY 0, retained workspace count 1**, no horizontal overflow. Screenshots inspected. No live-provider success is claimed from this smoke.

Intermediate failures were retained and investigated: initial scroll reproduction asserted focus on the inner section rather than its actual wrapper; the first implementation did not defeat Forward scroll restoration; the new Back journey exposed pre-hydration file selection; Playwright `goBack()` waited for a load after the test deliberately cancelled it, so cancellation now triggers `history.back()` and separately verifies the real dialog/state. The moved helper's evaluator import also failed typecheck until updated. No test assertions were weakened to hide product failures.

## Remaining concerns

1. The two medium-priority AI false-rejection cases above remain. Neither was shown to be the cause of the earlier live weak-resume failure.
2. The previous live Gemini suite remains **8/9 bounded fixture checks**, overall failure on weak-general `INVALID_RESPONSE`. No live calls or success-chasing reruns were made in this follow-up.
3. No deployed URL: Vercel authentication, project/protection configuration and hosted smoke matrix remain pending. Local preparation is not the requested completed hosted deliverable.
4. Supabase migration/cleanup, hosted Auth and two-user isolation remain pending operator setup. Removing an informational box does not fix absent tables.
5. Unrestricted public release still needs distributed abuse/cost controls, provider budget configuration, hosted parser resource/cancellation checks and applicable privacy review. Last dependency audit had zero runtime findings and 13 tooling entries; dependency audits were not rerun in this follow-up.
