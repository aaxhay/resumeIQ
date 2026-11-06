# Architecture overview

## One application, explicit boundaries

Next.js App Router + strict TypeScript, Tailwind, and shadcn/ui. The session-only MVP needs no database. The current milestone implements upload → mode selection → extraction → editable text confirmation → explicit deterministic text checks. Optional consent-based Gemini review adds a grouped results dashboard, explicit job-description fields, and requirement-level evidence comparison. A separate controlled improvement workspace reuses validated recommendations with explicit accept/reject/manual editing, original-coordinate patches, undo, and restore. Nothing is applied automatically. Full generative rewriting and export remain future work. See [controlled improvement](resume-improvement.md).

```text
src/app/                         Server pages and thin Node route handlers
src/components/ui/               Reusable accessible UI primitives
src/features/review/             Client form, async state, validation, mode definitions
src/lib/resume/                  Shared Zod contracts, limits, file screening
src/lib/resume-analysis/         Pure deterministic rules, findings, evidence, parser
src/lib/config/                  Pure environment validator
src/server/resume-processing/    Bounded requests, validation, isolated parsers, normalization
src/server/config/               Lazy server-only configuration
src/lib/ai-review/               Shared strict schemas and contact minimization
src/lib/job-description/         Pure explicit-field extraction and provenance contracts
src/lib/resume-improvement/      Immutable-source patches, strict contracts, bounded undo
src/server/ai/                   Gemini adapter, provider interface, evidence validation, guards
src/server/documents/            Reserved DOCX export
src/server/data/                 Reserved optional persistence
```

Import direction: UI/route → application processing → server adapter. Browser-safe shared contracts do not import parsers or providers. The child parser runs owned TypeScript source with Node 24; it is not a browser worker or an Edge function.

## Implemented flow

1. Browser metadata/header screening improves UX but is not authoritative.
2. The user chooses a review mode; job-specific text remains browser-local during extraction.
3. `POST /api/resume/extract` accepts a bounded multipart file or strict JSON pasted text. Actual bytes, suffix, compatible MIME and signature are checked server-side.
4. A short-lived process performs PDF/DOCX validation and extraction, normalizes whitespace, and checks text completeness. It is killed on deadline/cancellation/completion. No disk extraction or document persistence.
5. A typed, uncached response returns text, warnings, and statistics, or a safe error. Empty/scanned/insufficient text is a processing failure, never poor-resume feedback.
6. The browser shows editable text. Confirmation validates the current edited text and preferences. Input changes invalidate confirmation; cancellation/reset ignore stale responses.

7. After confirmation, an explicit **Run text checks** action calls `analyzeResume(text, options)` in the browser. It validates normalized text/options and returns typed observations/suggestions with stable IDs and exact evidence locations. No extra transmission, AI provider, score, or job-description matching.
8. The UI groups findings, distinguishes objective observations from advice, and lets the user select evidence in the editor. Changing text/mode/job description clears confirmation and results. Explicit project relevance controls only the projects-presence check.

The analyzer imports only browser-safe contracts/helpers and Zod; it can also run directly under Node 24 without Next. It does not depend on server adapters or the frontend. See [deterministic-analysis.md](deterministic-analysis.md) for rule thresholds, evidence conventions, limitations, and verification, and [extraction.md](extraction.md) for parser bounds and deployment requirements.

## API boundaries

| Route | Status | Input/output |
| --- | --- | --- |
| `POST /api/resume/extract` | Implemented | One PDF/DOCX or `{text}` → text/warnings/stats or typed error |
| `GET /api/reviews` | Implemented | Configuration-presence and operator privacy-policy booleans only |
| `POST /api/reviews` | Implemented | Confirmed minimized previews, consent, general/job mode → validated feedback and nullable jobAnalysis or safe error |
| `POST /api/resume/export` | Planned | User-approved structured resume → DOCX |

The analysis endpoint must repeat text, mode, and job-description validation and require consent. A browser confirmation flag is not proof of trusted content. Gemini must receive supplied documents as untrusted data, never instructions. Validate model output; do not fabricate achievements or ATS guarantees. Invalidate analysis when text/preferences change, and export when approved content changes.

## Session and privacy

Resume bytes/text are processed in server memory. Edits/JD stay browser-local until the optional AI action sends reviewed minimized previews to the server and Google. Explicit consent and synthetic-only/paid-reviewed operator policy are checked server-side. No localStorage, account, database, document files, or stored provider output. Hashes/timestamps provide short-lived local duplicate controls; no raw documents are cached. Improvement drafts remain separate browser-memory snapshots when analysis inputs change. Replacing one requires confirmation; Start over confirms discarding the workspace before clearing the page. Reload also loses local work, with a best-effort browser warning while a workspace is open. Process exit is not secure erasure. No document/prompt/provider payload logging. Google has separate retention/security/abuse terms; do not promise zero provider retention. See `ai-integration.md`.

Supabase remains deferred until an actual history/account requirement justifies Auth, private Storage, RLS, retention, and ownership tests.

## Release constraints

Local Node 24 full-project execution is the supported path. Keep worker sources/shared modules and runtime dependencies available; do not assume standalone/serverless tracing packages them. No host is selected or tested. A V8 heap limit is not a native-memory/RSS limit, and child processes are not security sandboxes. Public release requires OS/container limits, upload/body/deadline settings, distributed abuse/rate controls, and deployment-specific verification. Gemini is configured locally for synthetic verification, with bounded process-local controls; distributed per-user limits, provider budget controls, paid-service/privacy review, and production access restrictions remain public-release gates. Only the adapter imports SDK types. Generation JSON is validated by full Zod schemas and exact evidence checks before any UI result; malformed feedback is never silently displayed.
