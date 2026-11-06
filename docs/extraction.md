# Resume upload and text confirmation

Implemented on 2026-11-06. This milestone stops at **confirmed editable text**. It does not analyze, score, rewrite, or export a resume.

## Workflow

1. Open `/review`. Choose one PDF/DOCX, or select **Paste resume text**.
2. Choose General Review or Job-Specific Review. The latter requires 50–10,000 characters of job-description text; the description is not sent for extraction.
3. Choose **Extract resume text** / **Prepare pasted text**. This sends only the resume input to this application's server.
4. Inspect the editable text and extraction warnings. Correct section order, missing content, dates, and bullet points.
5. Choose **Confirm resume text**. Confirmation refers to the current text and preferences in page memory. Edits or preference changes invalidate it. No AI call occurs.
6. **Start over** cancels the request and clears page input. Reload also clears page state. There is no browser storage, account, database, or application file storage.

## API and module boundaries

`POST /api/resume/extract` runs in the Node runtime:

- Multipart: exactly one `file` field containing a PDF/DOCX.
- JSON: exactly `{ "text": "..." }` for pasted input.
- Shared Zod envelope: `{ ok: true, data: { source, text, warnings, stats } }` or `{ ok: false, error: { code, message } }`.
- `Cache-Control: no-store`; safe errors without resume text or raw parser exceptions.
- Rejects cross-site browser requests. This is not authentication or a public abuse-prevention system.

`src/lib/resume/` owns shared limits, metadata/signature checks, and API/confirmation schemas. `src/server/resume-processing/` separates bounded request reading, authoritative byte validation, process lifecycle, PDF/DOCX extraction, normalization, extraction-quality checks, and safe errors. The React hook only orchestrates requests and page state; it does not parse documents.

## Enforced limits

| Boundary | Limit |
| --- | --- |
| File bytes | 4 MiB (UI label: 4 MB) |
| Multipart body | 4 MiB + 64 KiB framing allowance; below Vercel's 4.5 MB ceiling |
| JSON body | 80,000 × 6 + 1,024 bytes (allows JSON escaping) |
| Read deadline | 15 seconds |
| Parser deadline | 15 seconds, terminated process |
| Browser request deadline | 40 seconds |
| Concurrent route requests | 4 per loaded route instance |
| Concurrent parser processes | 2 per loaded runner module |
| Parser V8 old-space heap | 192 MiB |
| Resume text | 80,000 characters, never silently truncated |
| Minimum readable text | 40 characters, 8 whitespace-separated words, 20 letters/numbers |
| PDF | 20 pages |
| DOCX ZIP | 1,000 entries; 20 MiB total declared/actual expansion |
| DOCX XML part | 8 MiB; XML depth 256; metadata children 10,000 |

PDF processing disables evaluation and worker fetching, checks the end marker, extracts text per page, and destroys the parser in `finally`. Reading-order warnings are always shown for PDFs. Blank/low-text pages and short/garbled extraction get completeness warnings; empty or insufficient text is an error, not poor-resume feedback.

DOCX processing validates ZIP local/central headers, names, duplicates, encryption, macros, streamed size/CRC, OOXML required parts, content types, relationships, XML syntax, and namespace/body structure. It rejects DTD/entity declarations. Mammoth runs with external file access and embedded style maps disabled. Converter HTML is consumed as data by a server-side plain-text converter; it is never sent to the browser or rendered. Paragraphs, headings, list markers, and table-cell separation are retained where possible.

QA corrections (2026-11-07): DOCX archives with nonblank Word text in header/footer parts fail with `UNSUPPORTED_FORMAT` and guidance to move text into the body or paste the complete resume. This is a conservative rejection, including unused parts, not implemented header/footer extraction. Blank header/footer parts remain supported. Hyperlinks retain only visible text; a bounded static `partial` warning asks users to copy needed contact/profile destinations into visible text before confirmation/export. Destination values are never fetched, appended, logged, or rendered. Bookmark-only links do not trigger that warning.

Normalization preserves line/paragraph boundaries and ordinary hyphenated lines while normalizing whitespace, controls, and common ligatures. It does not promise exact layout reconstruction. Upload aborts immediately cancel the body reader even when no further chunk arrives; tests distinguish abort, read deadline, and network interruption.

## Process lifecycle and privacy

Each request starts an owned Node process over IPC, using Node 24's native TypeScript support and `--conditions=react-server`. The child receives only the bounded processing input and a minimal environment, not provider secrets or `NODE_OPTIONS`. Parser stdout/stderr are discarded. Successful output is schema-validated. Timeout, cancellation, invalid output, and completion terminate the process; concurrency slots are released after exit. Application code does not log document text or save uploaded files. Garbage collection is not cryptographic memory erasure.

A separate process and heap cap are **not a complete security sandbox or a total-RSS cap**. Native/external memory, kernel resources, and parser vulnerabilities still require OS/container controls on a real deployment. Concurrency limits are process-local, not distributed rate limits. Deploy behind body/time limits, authentication or abuse controls as appropriate, and global rate limits before public exposure. No public deployment is approved or verified by this milestone.

## Runtime/deployment requirements

Use a full-project Node 24 deployment: retain `src/server/resume-processing`, `src/lib/resume`, `package.json`, and runtime `node_modules` alongside the Next build, with the project root as the working directory. The worker executes owned `.ts` source outside the Next bundle. Do not deploy only `.next` or assume a standalone/serverless artifact includes the worker and parser dependencies. The Vercel demo configuration now explicitly traces worker source and its installed runtime dependency closure using `scripts/deployment-tracing.ts`; absent required dependencies fail configuration, and installed platform-native optional packages/assets are included. This is packaging preparation, not hosted verification. Edge is unsupported. See [deployment checks](deployment.md) for the current serverless/Linux verification status. Build dependencies are needed at build time. `pdf-lib` is a development-only synthetic fixture tool; the later DOCX-export milestone promoted `docx` to a runtime dependency for server-generated downloads.

Unsupported: OCR, legacy `.doc`, password-protected documents, exact column/table layout, uncommon OOXML encodings/packaging, and documents beyond the limits. Offer fresh exports or pasted text rather than pretending extraction succeeded. Final edited text must be validated again on the server when a future analysis endpoint is added; client confirmation is not an authorization boundary.

## Verification

Final `npm run check` exited **0** on 2026-11-06:

| Check | Result |
| --- | --- |
| ESLint | Passed, zero warnings |
| Strict TypeScript / Next route types | Passed |
| Vitest | 112 tests passed in 6 files |
| Production build | Passed; dynamic extraction route and static landing/review pages |
| Production Playwright | 34 desktop/mobile browser/API tests passed |
| Live development app | PDF desktop/mobile and DOCX 320px / pasted-text 768px flows passed through editing and confirmation |
| Screenshots | Desktop, mobile, and 320px confirmation screenshots inspected; no horizontal overflow in exercised widths |
| Runtime dependency audit | Zero reported vulnerabilities |
| Full dependency audit | 13 tooling entries: 2 low, 11 moderate; no high/critical |

Coverage includes genuine synthetic PDF/DOCX parsing; empty, short, corrupted, unsupported, mismatched-MIME/signature, oversized, and excessive-page input; bounded multipart/JSON; DOCX archive/XML/CRC rejection; structure normalization; exact edited text; invalidation; job-description validation; fallback paste; drag/drop; cancellation/stale responses; keyboard controls and page reset. Process deadline/abort/concurrency tests use mocked child-process events to assert termination and lifecycle behavior; the happy-path API/browser tests launch actual parser processes. The delayed browser-response cancellation test is explicitly intercepted, not a real slow parser.

Initial verification caught and fixed: a Windows/Turbopack `fork()` entry-point resolution failure (replaced with explicit Node spawn), a browser-origin check using Next's normalized URL instead of the incoming Host, a multipart test assuming Playwright exposes file postData, and strict fixture typing errors. The full final rerun passed.

All fixtures are synthetic; no private resumes or live AI services were used. Dedicated `test:e2e:dev` was not rerun; the already-running development app was driven directly instead. No public-host deployment, Linux/standalone packaging, full accessibility audit, cross-browser engine suite, total-memory stress test, or production security certification is claimed.

Local ignored artifacts: `artifacts/extraction-dev-desktop.png`, `artifacts/extraction-dev-mobile.png`, `artifacts/extraction-dev-docx-320.png`, `artifacts/extraction-dev-paste-768.png`, plus production screenshots in `test-results/`.
