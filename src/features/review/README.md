# Review workflow

The client form supports upload or pasted text, mode/job-description setup, server extraction, editable confirmation, explicit deterministic text checks, evidence selection, cancellation, and reset. Optional Gemini general review and job-description evidence comparison follow a separate editable provider preview and explicit consent. Export and automatic source editing are not implemented.

`components/deterministic-review.tsx` invokes the pure `src/lib/resume-analysis` module only after confirmation and an explicit Run text checks action. It makes no extra network request, shows objective observations separately from optional suggestions, and does not calculate scores. Projects relevance is opt-in. Input/preference changes invalidate confirmation and unmount results; changing project relevance clears results. Both review modes use the same general rules. See `docs/deterministic-analysis.md` for the API and rule limitations.

- `validation.ts`: browser-safe setup schemas, shared file screening, display formatting.
- `review-options.ts`: shared mode descriptions.
- `use-review-setup.ts`: page-memory state, local file checks, typed extraction requests, abort/deadline/stale-response handling, confirmation invalidation.
- `components/`: upload, mode, job description, editor/confirmation and feedback UI. No extraction or provider SDK logic lives in React.
- `components/ai-review.tsx`: availability, minimized editable previews, synthetic-data/transfer consent, bounded waiting, explicit retry/cancel, stale-result invalidation, and escaped evidence-backed general/job feedback. See `docs/ai-integration.md`; provider outputs are validated on the server before display.

General mode does not require a job description. Job-specific text is 50–10,000 characters and stays in browser memory during extraction. The API receives only the file or pasted resume. Confirmation validates current edited text; changing text or preferences invalidates it. Start over or reload clears the page. No localStorage or persistence.

Server modules in `src/server/resume-processing` are authoritative. See `docs/extraction.md` for limits, privacy, and deployment constraints.
