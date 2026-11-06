# AI integration boundary

`provider.ts` defines the provider-independent `ResumeAiProvider`: `analyzeResume`, `analyzeJobMatch`, and `rewriteResumeBullet`. Only `gemini.ts` imports Google's SDK. The application consumes shared Zod contracts, not Gemini types.

- `gemini.ts`: server-only key/model access, structured generation, one request plus at most one eligible validation-correction call within a shared deadline, cancellation/deadline and safe error mapping.
- `prompts.ts`: evidence-only instructions; JSON document fields are untrusted data. No tools or external grounding.
- `json-schema.ts`: generation-compatible JSON Schema; full Zod validation still runs locally.
- `validate.ts`: exact quotes, required coverage, conservative job support, extractive rewrites, introduced-number checks. Not a semantic/factual proof.
- `request.ts`: origin, content type, bounded streamed body, deadline, strict request validation.
- `guard.ts`: bounded in-process concurrency/quotas/duplicate suppression using hashes and timestamps, never raw documents or output.
- `errors.ts`: safe application errors; no provider payloads in client errors or logs.
- `validation-failures.ts`: allowlisted public validation reasons and correction eligibility. Unknown causes stay private; transport, safety blocks, and incomplete/oversized output do not trigger correction.
- `job-analysis.ts`: exact-evidence job inventory, conservative field extraction, and unassessed fallback requirements without additional provider calls.

Real personal documents are gated on explicit operator configuration. See `docs/ai-integration.md` for terms, limits, configuration, verification, and public-release blockers. No automatic edits/export or persistent resume storage.
