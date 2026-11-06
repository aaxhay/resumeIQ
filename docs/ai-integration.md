# Gemini AI review

## Provider verification (2026-11-06)

Reviewed official Google documentation before implementation:
- [Official SDKs](https://aistudio.google.com/docs/libraries): maintained JavaScript/TypeScript SDK is `@google/genai`, not deprecated `@google/generativeai`.
- [Structured output](https://aistudio.google.com/docs/structured-output): schema-constrained JSON still requires application validation; valid JSON is not semantic/factual correctness.
- [Models](https://aistudio.google.com/docs/models): select an available non-preview text model explicitly, never silently fall back to a deprecated name.
- [Troubleshooting](https://aistudio.google.com/docs/troubleshooting): quota/rate limits, access errors, transient service failures.
- [Rate limits](https://aistudio.google.com/docs/rate-limits): per-project, model/tier-dependent quotas; multiple keys do not multiply project allowance. Inspect actual limits in AI Studio.
- [Terms](https://aistudio.google.com/docs/terms), effective March 23, 2026: see privacy gate below.

Pinned `@google/genai@3.0.0` after npm metadata confirmed Node >=22 compatibility with this project's Node 24. Its installed public API supports `models.generateContent`, `responseMimeType`, `responseJsonSchema`, cancellation, HTTP timeouts, and configurable retries. The current documentation defaults to newer Interactions examples; this implementation uses the SDK's supported stateless generateContent API with no stored interactions or tools. Actual authenticated model listing and structured-generation probes, not documentation alone, verify access.

## Configuration and privacy gate

Only the server reads `GEMINI_API_KEY` and `GEMINI_MODEL` from ignored `.env.local`. The template has no credential. No `NEXT_PUBLIC_` secret, no credentials in prompts, logs, response bodies, tests, or client bundles. Missing configuration disables AI; extraction and deterministic checks still work. GET `/api/reviews` exposes only configuration-presence and operator-policy booleans, not key/model credentials or a claim that billing was verified.

Default `GEMINI_DATA_POLICY=synthetic-only` allows only explicitly confirmed synthetic, non-confidential examples. **Redacting a real resume does not make it synthetic.** Google unpaid-service terms prohibit personal/sensitive/confidential inputs and may permit product improvement and human review. Paid services have different protections: prompts/responses are not used for product improvement, but security/abuse/legal logging and temporary storage still apply. Do not promise zero Google retention. Terms also impose supported-region and adult-use requirements; EEA/Switzerland/UK app distribution has paid-service requirements.

Set `GEMINI_DATA_POLICY=paid-reviewed` only after the operator verifies applicable billing, terms, data-processing arrangements, access restrictions, privacy disclosures, and deployment safeguards. This value is an operator attestation, NOT automatic billing verification or legal compliance. It is not enabled by this milestone.

After confirming extracted text, the user sees a separate AI panel. Best-effort email/phone/link removal creates editable previews. Names, postal addresses, confidential statements, and identifying context may remain: the user must remove unnecessary information. Only the previews are submitted, not the original file/editor. Server-side minimization runs again. Explicit consent identifies Google, adult/supported-region requirements, and the transfer. In job mode, the job preview is also sent. Extraction and local deterministic checks do not call Google.

No raw resumes, provider outputs, or prompts are persisted or logged by the application. Processing and browser results are in memory. Only request IDs, input hashes, and timestamps remain briefly for local duplicate/usage controls. Hashes are not claimed to be anonymous. Browser reload/reset discards results; abort does not guarantee Google stops processing or billing.

## Architecture and contract

- `src/lib/ai-review/contracts.ts`: strict Zod request, response, availability, rewrite contracts; inferred types.
- `src/lib/ai-review/privacy.ts`: browser/server-shared best-effort minimization.
- `src/server/ai/provider.ts`: vendor-independent `analyzeResume`, `analyzeJobMatch`, `rewriteResumeBullet` interface.
- `src/server/ai/gemini.ts`: only SDK-dependent module; server-only credentials, generation, timeout/cancellation and safe errors.
- `src/server/ai/validate.ts`: schema plus evidence/completeness checks; reused by the route for alternative providers.
- `src/server/ai/request.ts`, `guard.ts`: bounded HTTP input, origin checking and local cost/duplicate controls.
- `src/app/api/reviews/route.ts`: GET capability disclosure; POST validation → policy → minimization → provider → revalidation.
- `src/features/review/components/ai-review.tsx`: previews/consent, explicit submit/retry/cancel, escaped feedback, stale-result invalidation.

General review returns an assessment, exactly three priorities, evidenced strengths, coverage of all ten requested areas, detailed findings/recommendations, optional extractive rewrites, and limitations. Strong resumes may have no findings; priorities may preserve strengths or suggest optional improvements rather than manufacture defects.

Job review additionally returns up to twenty explicit requirements with category, exact JD evidence, resume evidence when available, explanation/recommendation, and `supported`, `partially_supported`, `not_evidenced`, or `not_assessed`. Not evidenced is never proof of lacking a skill. This is a bounded, non-exhaustive comparison, not a fit score or hiring judgment. Sparse descriptions may return an empty comparison list rather than invented requirements. The results-dashboard milestone adds a validated `jobAnalysis` response field with conservative explicit-field extraction and unassessed fallback requirements, without an extra provider call; see [dashboard methodology](results-dashboard.md).

## Validation and hallucination limits

Every response passes strict Zod required fields, enums, string bounds, array limits and object shape. Additional checks enforce unique full area coverage, unique finding IDs, exact contiguous evidence against the submitted source, high-impact evidence, mode-consistent job output, actual JD requirement phrases, and resume evidence for supported/partial claims. Every substantive term of a supported requirement needs literal normalized evidence across its exact resume citations; conjunction-separated requirements can cite separate passages. Semantic equivalents without literal evidence can be marked partial. Introduced numeric strings in generated prose are rejected.

Suggested rewrites are deliberately **extractive shortening only**: original must be an exact supplied substring, quoted by the finding; revised must be a contiguous substring of that original. This prohibits adding new words/metrics/employers/qualifications. No automatic source editing is implemented. General paraphrasing is deferred rather than pretending to guarantee factual preservation.

Exact quotes and lexical/number checks cannot prove semantic entailment, factual truth, preservation of qualifiers, or completeness. A model could misinterpret a negation or reuse an existing metric in the wrong context. The system prompt prohibits those behaviors; the UI still requires human verification and makes no hallucination-free claim. Prompt injection is untrusted document data, separated from system instructions in JSON. No tools, external retrieval, secrets, or privileged actions are exposed to the model. Tests exercise both resume and JD injection, but no prompt defense is a complete security guarantee.

The generation schema omits costly length/pattern/item-count constraints that caused Gemini to reject the full nested schema. The instructions explicitly state the bounds, and **all original constraints remain mandatory in Zod after generation**. Never truncate or coerce malformed AI feedback into a success. Diagnostic labels expose no source/output values.

## Validation-error recovery and safe diagnostics

A later reliability fix labels previously unspecified validator failures: duplicate/missing coverage areas, duplicate finding IDs, high-impact findings without evidence, uncited rewrite originals, job matches in general mode, partial matches without evidence, and not-evidenced matches with contradictory citations. These now qualify for the existing single correction attempt instead of failing immediately. Validation itself is unchanged: repeated invalid output is still rejected, no citations or claims are repaired locally, and the same sixty-second/two-call maximum applies.

Failure responses may include an allowlisted `validationIssue` (`format`, `coverage`, `evidence`, `rewrite`, `unsupported_claim`, `unverified_number`, `job_claim`, `output_limit`, `blocked`, or `incomplete`). The UI renders static explanations, never raw provider messages, source text, diagnostic paths, or output. Blocked/truncated/empty/non-JSON responses remain non-correctable automatically; output limits and safety blocks are distinguished from evidence errors. Unknown causes receive no public diagnostic detail. A browser response-contract mismatch has its own UI explanation, including saving local edits before refreshing an outdated page.

The user's original generic message alone does not establish which condition occurred. Final recovery verification: `npm run check` passed with **482 unit/integration tests**, **68 desktop/mobile browser/API tests**, lint, strict types, and production build. Regression cases cover every newly correctable failure, the two-call cap, no automatic correction of blocked/truncated output, safe allowlisted reasons, and UI error/focus/preview preservation. Two diagnostic synthetic general calls passed, followed by an actual PDF-upload/general-dashboard live Gemini success after the recovery change. Those checks do not prove that every document will produce valid feedback. Do not ask users to publish their resume or repeatedly incur retries just to diagnose an error; ask for the displayed safe reason instead.

## Limits, retries, and cost

- AI resume: 40–30,000 characters and at least eight words; JD: 50–10,000 characters in job mode. Extraction retains its separate 80,000-character limit. Oversized AI input is rejected, never silently truncated.
- Request body: 250,000 actual streamed bytes, ten-second read deadline, JSON only, same-origin Origin required. Confirmation/consent are validated but are not authentication or proof of truth.
- Output: 8,192 tokens, 100,000 text characters before JSON parse; bounded field/array schemas; complete STOP finish required. Safety-blocked/truncated output is not shown.
- Provider deadline: sixty seconds, propagated abort; browser waiting deadline: seventy-five seconds.
- SDK automatic retries disabled (`attempts: 1`). One additional correction call is permitted only for diagnosed schema/evidence failures, within the same sixty-second total deadline. The model receives static validator labels and the original minimized inputs, never rejected model output. The UI discloses this possible second charge. No automatic retry for transport/timeout/429/access errors or blocked/truncated output. A second invalid response is rejected. Explicit user retry uses a new request ID and may incur another charge.
- Local process limits: two concurrent calls, ten admissions per rolling-start minute, one hundred submissions per rolling-start day (up to two provider calls each), five-minute request-ID replay suppression, same-input concurrent suppression and thirty-second post-completion cooldown. Only hashes/timestamps are stored. Rejected admissions do not spend provider quota.
- These caps reset with the process and are not distributed limits, authentication, or hard monetary budgets. **Do not expose the endpoint publicly** until trusted ingress, distributed per-user/global limits, provider spending budgets, production cancellation/resource behavior, and privacy/access controls are verified.

## Job-specific claim recovery (2026-11-06)

A synthetic composite job description reproduced the reported `unsupported_claim` rejection with the configured Gemini provider. The internal failure was `unsupported-requirement-claim`: a `supported` label failed the existing literal full-requirement evidence check. This reproduces the failure class, not the user's private document pair.

The validator now collects unsupported job statuses and unverified numeric prose fields before rejecting, and supplies at most 24 allowlisted reason/path pairs to the existing correction attempt. Diagnostics contain only static reason codes and schema paths, not document text or rejected model prose. Paths remain internal; the API/UI distinguish `job_claim` from `unverified_number`, retaining `unsupported_claim` for combined/legacy failures. Other structural/evidence failures may still terminate validation earlier.

Baseline and correction instructions now explicitly align with the literal support rule: relevant experience alone does not establish every qualifier, and semantically related evidence should receive a cautious partial assessment. The model must not drop job qualifiers to claim support, calculate experience duration, count items, or invent example metrics. These are generation instructions, not a guarantee of semantic accuracy. No validator was relaxed; no invalid response is silently downgraded or partially displayed. Limits remain the original call plus one eligible correction within the shared sixty-second deadline.

After the change, the same live synthetic composite-JD case returned a fully validated response with six comparisons: one supported, four partially supported, and one not evidenced. This was an actual configured-provider request, separate from mocked tests. It does not guarantee every future response will validate. Only synthetic data was sent; no model, SDK, dependency, or privacy-policy configuration changed.

Verification for this fix: `npm run check` passed lint, strict TypeScript, **542 unit/integration tests across 19 files**, the production build, and **84 desktop/mobile browser/API tests**. Regressions cover combined claim diagnostics, malformed diagnostic rejection, unchanged strict validation, the two-call cap, safe public categories, preserved previews, error focus, and explicit retry with a fresh request ID. Browser tests mock the review API; the live composite-JD request above separately verifies the configured provider. A credential-pattern/configured-key scan found zero matches in 25 changed/new project files and twelve production browser assets. No dependency audit was rerun because dependencies did not change. Changes remain uncommitted; the existing placeholder Git author identity was not altered.

## Independent QA guards and synthetic evaluation (2026-11-07)

Read-only adversarial inspection found that exact quotations alone admitted unsupported prose, technical-token collisions, and candidate numbers borrowed from the JD. The new bounded grounding layer checks technical phrase boundaries, source-scoped numbers (including selected spelled quantities), explicit technology/job attribution, selected candidate employment/title/credential assertion forms, and recognizable negated/instruction evidence. Whitespace-only rewrites are rejected. Conditional truthful additions remain advice, but cannot exempt a separate unsupported job assertion. The strict schema, original-plus-one-correction cap, and shared deadline are unchanged.

These are narrow lexical defenses, **not general semantic verification**. Unrecognized technologies, assertion forms, negations, source-number reuse with different meaning, and evidence relevance still need human review. The evaluator explicitly reports `arbitrary-factuality`, `high-priority-semantic-relevance`, and `overall-helpfulness` as `not-established`; schema-valid feedback is not automatically a quality pass.

`tests/fixtures/ai-evaluation.ts` contains nine fictional cases: strong and weak general resumes, vague and concrete qualitative achievements, missing job evidence, extra resume technologies, resume injection, JD injection, and the explicit Python/database regression whose JD does not require CI/CD or microservices. The extra-technology case also puts CI/CD/microservices in the resume while leaving them absent from the JD. `scripts/ai-evaluation.ts` checks fixture criteria across generated prose and exact citations; mutation tests demonstrate that fabricated metrics, skills, employers, senior roles, credentials, unsupported job requirements, and missing high-impact citations trigger the corresponding bounded checks.

The live runner invokes each case once sequentially (at most nine provider invocations/eighteen generations with the existing correction allowance). It never reruns failures to obtain a pass, stops on transport/configuration/quota errors, marks remaining cases `not-run`, and prints only safe case/criterion metadata. Adversarial `safe-rejection` is distinct from useful feedback; ordinary-case rejection fails evaluation. Current execution results are recorded in [the QA report](qa-security-review.md), separately from historical checks below.

## Verification commands

`npm run check` runs deterministic tests with mocked provider boundaries, not paid requests. UI tests mock only `/api/reviews` and retain real extraction. `npm run test:ai:live` is separate, explicit, may incur charges, and uses only checked-in synthetic fixtures against configured Gemini. It exercises general, job-specific, resume-injection, and job-injection cases and prints only validation metadata/safe errors, never full resumes or provider output.

Historical AI-integration milestone verification on 2026-11-06 (subsequent dashboard checks and fresh live outcomes are in [results-dashboard.md](results-dashboard.md)):

- `npm run check`: lint and strict TypeScript passed; **366 tests across 14 files**, production build, and **62 desktop/mobile browser/API tests** passed. This includes 100 new unit/integration cases and 22 new AI UI browser cases. Provider mocks do not count as live success.
- `npm run test:ai:live`: actual `gemini-3.5-flash-lite` returned validated general and job-specific feedback, plus valid resume-injection and JD-injection responses. Each returned three priorities and all ten coverage areas; job cases returned three requirements. Injection canaries were not followed and unsupported Kubernetes was not classified supported. The harness also permits a safe validation rejection for adversarial injection cases, but that fallback was not used in this final run.
- Actual browser → local API → Gemini flow passed for desktop general review (1280px) and mobile job-specific review (390px), using only synthetic data and no API mocks. Confirm → minimize/consent → submit → validated result → edit/invalidate worked. No page errors/horizontal overflow; screenshots inspected in ignored `artifacts/`.
- Current runtime audit: **zero findings**. Full audit: unchanged **13 tooling entries (two low, eleven moderate)**, no high/critical. No forced fixes.
- Credential scan found no configured key/common credential patterns in 38 changed/new phase files or twelve production browser assets. `.env.local` and screenshots remain ignored. A pattern scan is not a security certification.

Development failures were not hidden: Gemini rejected the full constrained nested schema with HTTP 400; its simpler generation schema is followed by the unchanged complete local bounds. Some generated responses exceeded bounds, lacked priority evidence, or overstated support for more nuanced responsibilities; these were rejected, not displayed. One bounded correction and explicit atomic-requirement guidance improved acceptance. Compound requirements can cite separate exact passages, but every substantive term still needs evidence. Semantically complex requirements may still produce a safe rejection rather than usable feedback; exact-citation validation is deliberately conservative. The final core live fixture uses explicit atomic requirements; it is not evidence of comprehensive real-world matching accuracy. Exploratory alternative-model calls encountered access/service errors and were not adopted; no runtime silent model fallback exists.

The earlier broad dev-server suite encountered unrelated devtools font requests/timing differences; production assertions were not weakened. The final production gate passed. No real personal resume was sent to Google, no paid-service policy was enabled, and no public deployment or export was performed.
