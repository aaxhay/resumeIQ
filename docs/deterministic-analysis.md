# Deterministic resume text analysis

This milestone adds explainable, bounded **English-oriented text rules**, not AI review, ATS prediction, fact checking, a hiring assessment, or a score. Thresholds are local review triggers chosen for this implementation, **not industry standards**. An absence of findings is not a comprehensive pass.

## Standalone contract

```ts
import { analyzeResume, type ResumeFinding } from "./src/lib/resume-analysis/index.ts";

const findings: ResumeFinding[] = analyzeResume(normalizedText, {
  projectsRelevant: false, // default; only enable with explicit context
});
```

The synchronous function is pure: no network calls, provider SDK, React/Next imports, browser APIs, clock, randomness, persistence, logging, or mutation of caller input. It runs under Node 24 directly or in a browser/TypeScript consumer. Zod validates a nonempty string of at most 80,000 UTF-16 code units with LF line endings, and strictly validates options. Sparse text is allowed. Invalid input throws a ZodError; it does not produce an invented resume result.

Every finding includes `id`, `category`, `severity`, `title`, `description`, `evidence_text`, optional `evidence_location`, `recommendation`, `detection_source`, and `confidence`. Additional `rule_id` and `kind` make interpretation explicit:

- `kind: objective`: a directly observable property of the supplied text, e.g. an empty recognized section or adjacent word repetition. It is not necessarily an error in the original document.
- `kind: suggestion`: optional inspection or stylistic advice. These are not verified deficiencies or facts about the candidate.
- `severity: warning | info`: review priority only; never aggregated into a score.
- `confidence: high | medium | low`: qualitative confidence in the limited textual observation's interpretation, not a calibrated probability or resume-quality grade. Style/context-sensitive rules remain medium or low.
- `detection_source: deterministic`: always, with the separate exported analyzer version `1.0.0`.

IDs derive from rule identifiers and exact source offsets, not time/randomness. Order is fixed by category/rule order and each rule's deterministic traversal/grouping policy, not by a computed quality score. Identical inputs/options yield identical outputs. Locations use **1-based lines and 0-based UTF-16 offsets, end-exclusive**, against the exact supplied text. Evidence is always `text.slice(start_offset, end_offset)`. Whole-document absence findings use empty evidence and omit location; they do not fabricate quotes.

The function returns at most 200 findings. If more exist, it returns the first 199 plus an explicit omission notice. This is not a hidden passing result.

## Text parser and limits

Recognizes common standalone English heading aliases, case-insensitively, including Markdown prefixes, trailing colons, numbered headings, and supported combined labels such as `Experience & Projects`. Arbitrary uppercase employer names are not treated as new headings. Named auxiliary sections act as boundaries. Unknown/custom headings and other languages can cause missed or imperfect section boundaries.

Bullets include common unordered markers and numbered markers. Only explicitly indented lines are attached as wrapped bullet continuations; extraction may remove indentation. Paragraphs are non-bullet/non-heading lines bounded by blank lines or recognized structure. The rules cannot see font sizes, columns, page layout, margins, or whether content was dropped during extraction.

## Structure/readability rules

| Rule | Trigger and caveat |
| --- | --- |
| Contact not detected | No email, 10–15 digit phone pattern, or LinkedIn profile recognized. Does not require address, photo, or multiple contact methods. Unrecognized formats/extraction loss may explain absence. |
| Headings not detected | No supported standalone headings. One recognition finding replaces a cascade of core-section absence claims. |
| Core section not detected | With recognized structure, experience/education/skills labels are checked. Recommends making existing relevant information discoverable, not inventing content or adding irrelevant sections. |
| Projects not detected | Only when `projectsRelevant: true`; relevance is supplied explicitly, never inferred from career stage or profession. |
| Empty section | No letters/numbers between a recognized heading and the next recognized heading/end. Objective only about this text. |
| Short section | Fewer than 5 words in experience/education/projects/summary. Optional review suggestion; concise skills/auxiliary sections are excluded. |
| Mixed date formats | Named month/year vs MM/YYYY vs YYYY-MM within the same experience/education/projects section. Full/abbreviated month names are equivalent; year-only dates and comparisons across sections are excluded. No chronology or missing-month inference. |
| Long paragraph | More than 100 words in one parsed prose block. No claim about the original layout. |
| Dense text block | At least 180 words across at least 3 consecutive nonempty extracted lines. Textual grouping only, not visual density. |
| Adjacent repeated word | Case-insensitive repeated word runs on the same line with whitespace between tokens. Punctuation/line breaks stop a run. Repetition can be intentional or an extraction artifact. |
| Mixed bullet markers | At least 3 unordered bullets with differing markers in one recognized section. Numbered lists are not compared as differing markers; nesting may be intentional. |
| Mixed bullet punctuation | At least 3 bullets in a section with mixed sentence-ending punctuation. Fragment/sentence mixtures may be appropriate. |

## Writing and achievement rules

| Rule | Trigger and caveat |
| --- | --- |
| Repeated phrases | A normalized 3–6-word narrative phrase occurs in at least 3 distinct bullets. Requires a recognized narrative verb plus a connective; excludes selected common technical phrases. Longest phrase wins for overlapping groups, with alphabetical tie-breaking. One original representative bullet is quoted per group; repeated technical vocabulary is not inherently bad. |
| Excessive filler | At least 2 recognized filler occurrences in one bullet. Dictionary: `in order to`, `as a matter of fact`, `for all intents and purposes`, `at the end of the day`, `it is worth noting that`, `basically`, `actually`, `very`, `really`. Context may justify any of them. |
| Long bullet | More than 45 words, including recognized wrapped lines and excluding the marker. Length alone is not an error. |
| Broad opening | Bullet begins with `helped`, `assisted`, `participated in`, `worked on`, `worked with`, `was involved in`, or `were involved in`. Do not imply greater ownership than the candidate actually had. |
| First-person wording | Whole-word first-person language in bullets or recognized summaries; simple paired quotations and `my/our team’s` possessives are excluded. UI/API/US are not interpreted as pronouns. Personal voice may be intentional. |
| Conjunction-heavy bullet | More than 30 words and at least 4 `and`, `or`, or `but` tokens. This is a narrow possible multiple-ideas signal, not a grammar parser or unclear-sentence diagnosis. |
| Responsibility wording | Explicit responsibility opening without a recognized outcome or completed-deliverable cue. Qualitative outcomes and concrete deliverables count; no number is required. Short generic matches defer to the context rule instead of producing duplicate achievement advice. |
| Vague context/specificity | A 2–6-word bullet whose opening and every token belong to a narrow generic task/contribution vocabulary. `Built infrastructure` is concrete enough not to trigger. Suggests adding only truthful context if useful, never invents the task or outcome. |
| Repetitive openings | At least 3 eligible bullets share a recognized opening action word. One original representative bullet is quoted per group. Consistency can be intentional; use alternative verbs only when accurate. |

Achievement rules apply only to recognized experience/projects and unsectioned bullets, not skills/education/auxiliary lists. Writing rules are deliberately scoped, mostly to bullets; they are not comprehensive prose/style/grammar detection. Outcome recognition uses explicit words and phrases, not semantic understanding, and can miss implied outcomes. All nine writing/achievement checks are optional suggestions, not objective deficiencies.

## Application integration

Independent rule and integration tests passed **before** connecting the module to React. After confirming edited text, the user explicitly chooses **Run text checks**. The component calls the standalone module locally, without an API route, new dependencies, provider calls, or extra document transmission. Both review modes run the same general text checks; job-description matching remains unimplemented.

The optional projects checkbox supplies relevance explicitly. Changing it clears results; changing the resume, review mode, or job description unmounts the results and requires confirmation again. Source replacement/reset also clears results. Evidence includes line references and an **Inspect in editor** action that selects the exact source range. Long quotes show an explicitly labeled 600-character excerpt; the full evidence is retained in the returned finding and can be selected in the editor. No HTML is rendered from source text.

The UI distinguishes objective observations from optional suggestions and explains qualitative confidence. Empty results say the limited rules found nothing, not that the resume passed. Results do not change the source text or manufacture replacement achievements.

## Verification

Standalone Node 24 execution, 154 new analyzer tests (266 total project tests), lint, and strict TypeScript passed before UI integration. Tests cover each individual rule, boundary/negative cases, the five requested synthetic fixture types, exact evidence offsets, unique/stable IDs, repeated-call determinism, caller-input immutability, absence of network/time/random dependencies, invalid/oversized inputs, and explicit finding-limit notices.

An 80,000-character input initially exposed quadratic backtracking in the email-pattern check. Address-component bounds and token-start anchoring fixed it; the original boundary test then passed without increasing its timeout.

Final `npm run check` passed on 2026-11-06: zero-warning lint, strict TypeScript, all 266 unit/integration tests across 11 files, production build, and all 40 desktop/mobile Chromium browser/API tests. The six new browser cases verify explicit execution, exact confirmed edits, no analysis network requests, focus/evidence selection, input/mode/job-description invalidation, opt-in projects checking, and honest empty results.

The existing development app at `127.0.0.1:3000` was separately driven at 1280px, 390px, and 320px through paste → prepare → edit → confirm → run checks → inspect exact evidence → edit/invalidate. All three runs passed with no page errors or horizontal overflow. Desktop and narrow-phone screenshots were inspected; local screenshots remain in ignored `artifacts/`. No provider integration or live-provider test was performed. No dependencies were added in this milestone.
