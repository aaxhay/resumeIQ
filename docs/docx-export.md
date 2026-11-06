# Editable DOCX export

## Use and content ownership

After opening **Improve this resume**, save and **accept** any manual wording you want to apply, inspect the improved preview, then select **Download DOCX**. The filename is `improved-resume.docx`. The current preview is the only source: accepted AI edits and accepted manual edits are included; pending, rejected, saved-but-unaccepted, and unsaved suggestion buffers are excluded. Rejecting a suggestion retains the original passage, rather than deleting that passage from the resume. Export never writes back to the immutable original or changes suggestion decisions.

The button sends a snapshot of the preview to this application's server, not to Google. It does not send the original, job description, recommendation history, or rejected wording. There is no export-time AI call or permanent document storage. Contact details are intentionally retained when they exist in the preview; the UI discloses this transfer. A downloaded file is stored by the user's browser according to their settings and is not erased by Start over.

Workspace revisions remount the export control and abort any pending browser request, so an obsolete result cannot be offered as the current draft. Requests are not retried automatically. The button is disabled during generation, and failures preserve the draft and focus a safe error. Success says **Download requested**, not saved: browser/user cancellation or disk failure after handing off the file cannot be reliably observed from the page. Users can check browser downloads and retry explicitly.

## After download: completion screen

After validated bytes are handed to the browser, the review switches to `/review#download-complete` with **Your DOCX download has started**. This is a same-document completion view, not a route change that destroys the draft. The review subtree remains mounted but hidden, retaining the original, accepted decisions, saved manual suggestions, unsaved wording buffers, and download URL lifetime. Browser back/forward and **Return to review** preserve this local work. A fresh visit to the fragment does not fabricate a completed download or restore lost state.

The completion screen provides **Return to review**, **View account history (new tab)**, and **Start another review**, which requires explicit confirmation before discarding local work. It never automatically saves account history or claims that saving to disk finished. Account summaries still require separate preview/consent and cannot restore the editing draft. Failed or stale exports do not show completion. Refreshing/closing the page still loses the memory-only workspace.

## Template and preservation rules

- Single-column Word document using standard editable paragraphs and list numbering. No images, tables, decorative graphics, embedded objects, or custom layout engine.
- Arial 11-point body, 13-point bold Heading 1 for explicit known section headings, black text, consistent paragraph/line spacing, and 0.75-inch margins.
- Contact information, summary, experience, education, skills, projects, certifications, and all other content remain in source order **only if supplied**. No name, title, section, or qualification is inferred. Known standalone headings receive heading styling; unfamiliar headings remain ordinary text rather than risking incorrect classification.
- Recognized bullet markers become standard Word bullets. Signed numeric/currency values, numbered-list labels, and ambiguous marker-only text remain literal. Blank layout lines may collapse; surrounding whitespace is not an original-layout guarantee.
- Dates retain the supplied tokens, separators, and precision with consistent typography. The exporter does **not** guess locale, convert ambiguous numeric dates, add months, or invent an end date. Users should resolve inconsistent date wording in their source before export.
- An explicitly supplied empty section heading remains in the document without invented filler. A fully empty/whitespace-only resume is rejected.

This is a fresh clean template, **not preservation of the original PDF/DOCX layout**. Generated content is editable OOXML text, not a screenshot. Word-app rendering and pagination can differ by installed fonts and application; there is no universal ATS compatibility or original-layout guarantee.

## Boundary, validation, and limits

- `src/lib/resume-export/contracts.ts`: strict `{text}` input and typed failure envelope. Maximum 110,000 UTF-16 characters (80,000 original plus up to twelve 2,500-character edits), 4,000 source lines including blanks, and 4 MiB output (below Vercel's 4.5 MB response ceiling). XML 1.0-invalid characters and unpaired UTF-16 surrogates are rejected, not removed silently.
- `POST /api/resume/export`: Node-only, same-origin JSON, actual streamed body bound of `110000 * 6 + 1024` bytes, ten-second read timeout, fatal UTF-8 decoding, cancellation, and unknown-field rejection. The bounded JSON reader is shared with the AI endpoint without changing its input limits.
- Two concurrent requests and twenty generation admissions per rolling minute per process. Limits reset with the process and are **not** authentication or distributed abuse prevention. A public deployment still needs trusted ingress/authentication, distributed controls, and platform resource limits.
- `generateResumeDocx`: `Document`, `Paragraph`, `TextRun`, explicit numbering/styles, and asynchronous `Packer.toBuffer` from runtime `docx@9.15.2`. No filesystem, network, or model dependency in generation.
- Before returning bytes: enforce output size, validate ZIP/OOXML parts, CRC/relationships and expanded-size limits using the existing archive validator; re-extract text with Mammoth; compare every nonblank canonical line in order against the input after only allowed bullet/whitespace formatting. Warnings, missing/repeated/reordered/added content, corrupt archives, or generation/extraction failures reject the download.
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, attachment disposition with fixed safe filename, content length, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`.
- Safe error codes: `INVALID_REQUEST`, `BUSY`, `GENERATION_FAILED`, `INVALID_DOCUMENT`. Raw source, library errors, or stack traces are not returned or logged. Browser additionally checks response type, size, and ZIP signature before download and uses a thirty-second waiting timeout.

Generation/re-extraction operate on internally produced bytes in the server process with input/paragraph/output/concurrency bounds. Browser cancellation stops waiting but does not hard-kill an already running packer. Unlike uploaded-file parsing, export is not a separately heap-limited child process; deployment resource/deadline behavior remains a release check.

## Supported APIs and dependency review

Checked on 2026-11-06: npm `docx` latest is **9.15.2**, requires Node >=16, and is compatible with this project's Node 24. Existing version promoted from devDependency to runtime without a version upgrade. Official current source documentation confirms `Packer.toBuffer(document)` for Node and the installed exported TypeScript APIs are used directly.

- [Official docx project](https://github.com/dolanmiu/docx)
- [Official packer documentation](https://github.com/dolanmiu/docx/blob/master/docs/usage/packers.md)
- [Official documentation site](https://docx.js.org/)

Previously indexed `api/classes/Packer.html` and `api/classes/Document.html` URLs returned 404; source documentation and installed declarations were checked instead. Post-promotion audit: **zero runtime findings**; full audit retains **13 tooling entries (two low, eleven moderate)**. No forced fixes or additional install-script permissions.

## Verification

Focused generation/route/shared-reader tests, lint, and strict TypeScript passed before the full gate. Generation tests use real DOCX packing and re-extraction, including actual editing-engine accepted/rejected/pending states, all section types, empty sections, exact text/paragraph limits, Unicode and XML escaping, preserved dates, invalid characters, corruption, missing content, added facts, and generator/parser failures. Browser tests exercise real export/download/re-extraction after general PDF and job-specific DOCX uploads; only the AI review is mocked in happy paths. Failure tests explicitly mock export failures to verify recovery and stale-request suppression. The focused command passed 124 tests across generation, export-route, and AI-route files, plus lint and strict TypeScript. A separate actual development-server `POST /api/resume/export` returned status 200, the DOCX MIME/attachment headers, and a 10,006-byte synthetic file with matching re-extracted text; it made no AI call. Desktop and 320px mobile browser screenshots were inspected with readable export controls and no visible overflow. A credential-pattern/configured-key scan found zero matches in 24 changed/new files and twelve production browser assets. Final `npm run check` passed: **608 unit/integration tests across 21 files**, **90 desktop/mobile browser/API tests**, lint with zero warnings, strict TypeScript, and production build. Both general PDF and job-specific DOCX journeys download and re-extract actual generated files, verify accepted AI/manual changes, exclude rejected wording, and retain the original. Error cases cover server/network/wrong MIME/invalid ZIP responses and recovery; stale requests cannot trigger downloads after workspace edits. No live Gemini call was needed for this deterministic export feature, and mocked review fixtures are not described as live-provider verification. Native Microsoft Word rendering was not automated; editable OOXML structure, style definitions, and content roundtrips were tested. No commit or push was made.
