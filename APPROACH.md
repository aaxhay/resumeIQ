# Approach

An AI-powered resume review tool. Users upload a resume, get AI-generated insights and suggestions, review them, and export an improved DOCX.

## Feature Status

| Feature | 1–2 day feasibility | Status |
|---|---|---|
| Premium landing page | High | ✅ Done |
| PDF/DOCX upload | High | ✅ Done |
| Resume text extraction | High | ✅ Done |
| General AI review | High | ✅ Done |
| Job-specific review | High | ✅ Done |
| Evidence-backed suggestions | High, with validation | ✅ Done |
| Accept/reject/edit suggestions | High | ✅ Done |
| DOCX export | High | ✅ Done |
| Authentication and history | Optional | ✅ Done |
| Advanced ATS parsing and OCR | Defer | ❌ Not done |

## Additional Features Added

| Feature | Status |
|---|---|
| Dark theme toggle | ✅ Done |
| Gemini API integration for generating insights | ✅ Done |

## How It Works

1. **Upload**: the user uploads a resume as a PDF or DOCX file.
2. **Extract**: text is pulled out of the uploaded file.
3. **Analyze**: the extracted text (and the job description, for job-specific reviews) is sent to the Gemini API, which generates insights and suggestions.
4. **Validate**: each suggestion is backed by evidence from the resume, and is checked against the source text before being shown.
5. **Review**: the user accepts, rejects, or edits each suggestion.
6. **Export**: the final resume is exported as a DOCX file.

## AI Insights (Gemini API)

- Insights are generated using the Gemini API with an API key.
- The key is kept in an environment variable and is never committed to the repository or exposed in client-side code.
- Two review modes are supported: a **general review** and a **job-specific review** that compares the resume against a target job description.

## UI

- Premium landing page for first impressions.
- Dark theme toggle so users can switch between light and dark modes.

## Not Done (Deferred)

- **Advanced ATS parsing and OCR**: deliberately deferred to keep the scope achievable in 1–2 days. Scanned or image-only resumes are therefore not supported yet, and only text-based PDF/DOCX files are handled.

## Future Work

- Advanced ATS parsing
- OCR support for scanned resumes
