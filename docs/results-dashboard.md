# Job descriptions and results dashboard

## Evidence-first results

General review shows an overview, the provider's three priorities, strengths, main opportunities, grouped recommendation cards, area coverage, and limitations. Job-specific review adds extracted job fields and a requirement-by-requirement evidence comparison. No score, percentage, hiring probability, employer ATS claim, or invented rating is generated.

Recommendation cards distinguish the AI's severity judgment from an objective fact. Expand a card for original preview evidence, why it matters, the recommended action, and an optional extractive rewrite. Rewrites are never applied automatically. Empty categories do not imply the resume is error-free. Structure/formatting advice is about extracted text, not inspection of the original document layout.

## Job-description extraction

`src/lib/job-description/extract.ts` exports pure `extractJobDescription(text)` and `validateJobProfile(profile, text)` functions. Input is 50–10,000 characters, with a trimmed minimum of 50; the original string is preserved for offsets. No provider, React, storage, or network dependency is used.

- Title/company are taken only from recognized explicit labels. Missing, conflicting, empty, or oversized labeled fields stay unknown rather than being guessed from the first line.
- Recognized English sections and explicit wording identify required skills, preferred skills, responsibilities, experience, qualifications (education/certifications), and technical requirements.
- Compact skill lists can split on commas/semicolons. Alternatives and composite requirements are retained rather than converting an alternative into multiple mandatory skills.
- Preferred scope stays preferred, including preferred experience/qualifications.
- Unrecognized section labels end the preceding requirement context. The parser is deliberately conservative and not an exhaustive natural-language interpretation service.
- Each requirement and field retains exact source evidence, UTF-16 start/end offsets (end exclusive), and one-based line positions. Validation checks exact slices, lines, verbatim values, and unique requirement IDs.
- At most 100 extracted requirements are retained; entries over 2,500 characters are skipped in full. Limitations and the truncation flag disclose omissions. Line wrapping, nuanced conditions, negation, and unfamiliar labels can limit extraction.

## Matching and API boundary

POST `/api/reviews` retains the existing privacy gate, minimization, explicit consent, provider deadlines, cost guards, and strict model validation. The response now requires `jobAnalysis`: `null` for general review, or a validated `{ profile, comparisons }` for job-specific review. The provider's own `AiReview` schema is unchanged, so this feature adds **no extra model call**.

`src/server/ai/job-analysis.ts` revalidates provider feedback and builds the bounded inventory. A parser requirement is represented by an existing comparison only when exactly one AI comparison has the same verbatim requirement and category and includes its source evidence. Loose overlap, narrower skills, synonyms, and category differences cannot promote support. Otherwise it remains an additional **Not assessed** entry. Validated AI comparisons not recognized by the conservative parser remain visible. Repeated/conflicting or differently phrased entries may therefore appear separately; they are not silently merged. Exact quote matching cannot distinguish repeated identical passages or prove semantic entailment.

Statuses:

- **Supported:** supplied citations passed the existing conservative AI evidence checks; still an AI judgment, not factual verification.
- **Partially supported:** relevant resume evidence was supplied, but the comparison reports incomplete support.
- **Not evidenced:** no supporting resume citation was returned. This does **not** mean the person lacks the skill.
- **Not assessed:** ambiguous/unassessed model output or an extracted requirement without a unique exact comparison. It is not counted as unsupported.

Required/preferred coverage is a labeled list of individual comparisons, not a completeness percentage. Status filtering changes only the view. The inventory is bounded and non-exhaustive: the AI returns up to 20 comparisons and extraction up to 100 entries. No alignment estimate is computed.

## UI and privacy

Reusable presentation components live in `src/features/review/components/results/`; pure grouping lives in `results-model.ts`. Analysis stays in shared/server modules. Native details/summary controls expose evidence on demand and support keyboard operation. A loading skeleton contains no placeholder feedback. Existing safe errors, explicit retry/cancel, focus management, consent, and stale-result invalidation are preserved.

All evidence refers to minimized **submitted previews**, not PDF/DOCX layout or the original editable source. The browser renders plain React text, never generated HTML. Application results remain in page memory. The Google data-policy gate and public-release limitations in [AI integration](ai-integration.md) are unchanged.

## Verification

Final verification on 2026-11-06:

- `npm run check` passed: lint, strict TypeScript, **460 unit/integration tests across 17 files**, production build, and **66 production desktop/mobile browser/API tests**.
- Focused tests cover extraction provenance, missing fields, ambiguity, categories, limits, malformed profiles, deterministic behavior, exact matching, empty job assessments, unassessed fallbacks, and rejected fabricated evidence.
- Both modes passed from real PDF/DOCX upload through dashboard on desktop and mobile. Only the review endpoint is intercepted; synthetic output passes production semantic validation and job inventory construction. Every displayed blockquote is checked against the submitted input, and every returned citation is reachable through disclosures. This is not live-provider proof.
- Actual development app, no review mocks: synthetic DOCX → Gemini → job-specific dashboard passed at 390px, including exact evidence validation, filtering, no page errors/overflow, and stale-result invalidation. Mobile screenshots inspected.
- Fresh general-mode live attempts returned `INVALID_RESPONSE`, then `PROVIDER_ERROR`; the pipeline withheld feedback. These are not successful live general runs, and no claim is made that the provider is consistently available. No repeated retry loop or relaxed evidence validation was introduced.
- Desktop app dashboard and expanded recommendation screenshots inspected at 1280px with explicitly mocked, semantically validated synthetic feedback. Narrow browser tests passed at 320px.
- The first browser suite had four failures from two unscoped assertions repeated on desktop/mobile (duplicate limitations text and a hidden earlier evidence label). Assertions were scoped to the actual expanded disclosures; the final full suite passed without weakening evidence checks.
- Credential scan: 29 changed/new project files and 13 production browser assets, zero configured-key/common credential-pattern matches. Ignored environment files and screenshots were not staged. No dependencies changed, no real personal documents were sent, no paid-service policy was enabled, and no export/public deployment was added.
