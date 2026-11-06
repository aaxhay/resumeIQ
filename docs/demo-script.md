# ResumeIQ demo script

## Before presenting

- Use local http://localhost:3000, or a **verified, access-protected** demo URL only after deployment. Vercel deployment is currently blocked awaiting operator login; no hosted URL/success is established. See [deployment instructions](deployment.md).
- Use only fictional documents. Keep `GEMINI_DATA_POLICY=synthetic-only` and `SUPABASE_HISTORY_ENABLED=false` unless the hosted schema and scheduled cleanup have been verified. Never display `.env.local`, credentials, real resumes, or private account data.
- Allow about 5–7 minutes plus provider latency. Extraction/local checks work without Gemini; improvement/export follows a successful validated Gemini review. Do not promise that live AI will succeed or return a particular recommendation.
- The historical QA gate passed 818 unit/integration and 150 browser/API tests. The separate live evaluation failed overall (8/9 passed; weak general resume: `INVALID_RESPONSE`). Neither is verification of the latest UI/deployment work. New 4 MiB upload/export limits and Node 24 worker tracing still need the current gate/hosted smoke checks.

## Synthetic material

Copy this existing `aiResume` fixture from `tests/fixtures/ai-review.ts` into **Paste resume text**. These are invented facts, not a real candidate:

```text
Fictional Example
SUMMARY
Software developer focused on reliable systems and clear documentation.
EXPERIENCE
- Built TypeScript tools for internal documentation.
- Created a guide that enabled independent onboarding.
SKILLS
TypeScript, testing, documentation
EDUCATION
Example University, Bachelor of Arts
PROJECTS
- Published a synthetic resume parser with automated tests.
```

For job-specific mode, use the existing `aiJob` from the same fixture:

```text
Fictional software role. Required: TypeScript and documentation. Preferred: Kubernetes. Responsibilities include maintaining reliable tools and clear guides.
```

To show file upload instead, prepare a fictional PDF/DOCX with exactly this text beforehand. Repository test helpers `tests/fixtures/pdf.ts` and `tests/fixtures/docx.ts` generate synthetic documents for the automated upload journeys; the `.ts` helper files themselves are not uploadable resumes. Use text-based documents within the displayed limit, not scanned images.

## Main walkthrough

1. **Landing and purpose.** Choose **Review My Resume**. Say: “We inspect the text first, keep the original unchanged, and never apply AI suggestions automatically. There is no resume score.”
2. **Input and focus.** Choose **Paste resume text**, paste the fixture, and select **General Review**. Choose **Prepare pasted text**. For the upload variant, use **Choose file**, then **Extract resume text**. Explain that preparation/extraction sends input to the application server, not an AI provider.
3. **Confirm.** Inspect **Editable resume text** against the fixture, then choose **Confirm resume text**. Explain that editing the source or changing review mode requires confirmation again.
4. **Local checks.** Choose **Run text checks**. Open any returned **Evidence** disclosure and **Inspect in editor**. Say: “These limited rules run in the browser; observations are not factual verification, a job match, or an ATS score.” If no findings appear, report that honestly rather than inventing an issue.
5. **Optional live AI.** Inspect **Resume preview to send**. Only if the presenter meets the stated terms, select the synthetic-document checkbox and the Google-processing consent checkbox, then **Send previews to Gemini**. Explain the provider transfer and potential billing. Do not repeatedly retry for a more favorable result.
6. **Evidence before advice.** If **Gemini review complete** appears, inspect the actual assessment, recommendations, quotations, and limitations. Do not promise specific findings or treat exact citation matching as proof that an interpretation is true.
7. **Controlled editing.** Choose **Improve this resume**. Open **Confirmed original · unchanged** and compare **Improved resume preview**. On an eligible suggestion, use **Edit wording**, make a fact-preserving wording change, then **Save manual edit**. Show that saving alone does not change the improved preview; **Accept suggestion** applies it. Use **Reject suggestion** on another suggestion only if one exists. Show **Undo latest accepted edit** if an edit was accepted. If no editable evidence-backed suggestion is returned, show the honest empty state; do not fabricate a change.
8. **Export.** Review the entire **Improved resume preview**, then choose **Download DOCX**. Inspect the downloaded file in a document editor if available. Explain that it contains only accepted changes in a clean template, not a replica of the source layout. **Your DOCX download has started** confirms initiation, not that the browser saved the file. **Return to review** keeps the current in-memory workspace available.

## Job-specific variation

Select **Job-Specific Review**, paste the fictional job text into **3. Add the job description**, and confirm the resume again if preferences changed after confirmation. Review both **Resume preview to send** and **Job description preview to send** before consenting to another, potentially billable request.

If validated results arrive, inspect **Job evidence comparison** and its evidence disclosures. Explain the difference between supported evidence, missing evidence, and an unassessed requirement. Kubernetes not appearing in the resume does **not** prove the person lacks that skill. Do not invent a missing employer, title, salary, or experience requirement.

## Failure and closing script

- **No key or provider outage:** show the availability/error message and retained previews. Continue with local checks. Say that AI-dependent improvement/export cannot be demonstrated in this run without validated feedback.
- **Validation failure:** show the actual error; no rejected output is displayed. Never describe a safe rejection as a successful useful review. Retry only deliberately, with awareness of potential charges.
- **Extraction failure:** use **Use pasted text instead** when offered, or select **Paste resume text**. Explain the unsupported input rather than pretending the file parsed.
- **Export failure:** show the error and preserved draft; copy any text you need before leaving. Do not claim a download succeeded without inspecting it.
- **Repeatable automated fallback:** the existing `tests/e2e/resume-improvement.spec.ts` exercises both workflows with mocked AI and real extraction/DOCX round-trips. Present it explicitly as a deterministic test, never a live Gemini response. There is no fake-result demo mode to switch on.
- **Accounts:** do not promise working hosted history. It is optional, requires separate preview/storage consent, and never stores the editing workspace. Account navigation from review opens a new tab to keep the draft here.
- **Close:** “Save your DOCX or copy the text before leaving. Drafts are memory-only. Reloading does not retract provider transfers or delete downloaded files or separately saved summaries.” Use **Start over** only when ready to discard the local work, confirming the reset when prompted.
