# Architecture overview

## One application, explicit boundaries

Next.js App Router + strict TypeScript, Tailwind, and shadcn/ui. The session-only MVP needs no database. The current milestone implements upload → mode selection → extraction → editable text confirmation. Analysis, feedback, improvements, and export remain future work.

```text
src/app/                         Server pages and thin Node route handlers
src/components/ui/               Reusable accessible UI primitives
src/features/review/             Client form, async state, validation, mode definitions
src/lib/resume/                  Shared Zod contracts, limits, file screening
src/lib/config/                  Pure environment validator
src/server/resume-processing/    Bounded requests, validation, isolated parsers, normalization
src/server/config/               Lazy server-only configuration
src/server/ai/                   Reserved Gemini adapter
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

See [extraction.md](extraction.md) for enforced bounds, parser details, limitations, and deployment requirements.

## API boundaries

| Route | Status | Input/output |
| --- | --- | --- |
| `POST /api/resume/extract` | Implemented | One PDF/DOCX or `{text}` → text/warnings/stats or typed error |
| `POST /api/reviews` | Planned | Validated confirmed text, consent, general/job-specific mode → structured review |
| `POST /api/resume/export` | Planned | User-approved structured resume → DOCX |

The analysis endpoint must repeat text, mode, and job-description validation and require consent. A browser confirmation flag is not proof of trusted content. Gemini must receive supplied documents as untrusted data, never instructions. Validate model output; do not fabricate achievements or ATS guarantees. Invalidate analysis when text/preferences change, and export when approved content changes.

## Session and privacy

Resume bytes/text are processed in server memory; edits, confirmation and job description stay in browser page memory. No localStorage, account, database, or document file storage. Start over or reload clears the page; process exit releases the parser address space, not a guarantee of secure erasure. No document/prompt/provider payload logging. No AI requests exist yet. Future provider processing requires separate consent and verified data-handling terms.

Supabase remains deferred until an actual history/account requirement justifies Auth, private Storage, RLS, retention, and ownership tests.

## Release constraints

Local Node 24 full-project execution is the supported path. Keep worker sources/shared modules and runtime dependencies available; do not assume standalone/serverless tracing packages them. No host is selected or tested. A V8 heap limit is not a native-memory/RSS limit, and child processes are not security sandboxes. Public release requires OS/container limits, upload/body/deadline settings, distributed abuse/rate controls, and deployment-specific verification. Provider credentials, model selection, quotas, and cost controls are still prerequisites for analysis.
