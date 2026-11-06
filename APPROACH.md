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

## Development Phases

The project is built in ten phases. Each phase builds on the one before it, so the core workflow (upload, analyze, improve, export) works before any optional integrations are added.

| Phase | Focus | What it covers |
|---|---|---|
| **Phase 0** | Project initialization and engineering rules | Project setup, strict TypeScript, linting, and the coding and safety rules the project follows throughout |
| **Phase 1** | Design and application foundation | App structure, shared UI components, landing page, and the light/dark theme with toggle |
| **Phase 2** | Resume upload and document extraction | PDF/DOCX upload and pasted text, text extraction, and a step where the user checks and confirms the extracted text |
| **Phase 3** | Build the deterministic analysis engine | Local, rule-based resume checks that run without an API key or any AI call |
| **Phase 4** | AI integration and evidence-backed analysis | Gemini API integration, consent before sending data, and validation of AI output so suggestions are backed by evidence from the resume |
| **Phase 5** | Job description intelligence and feedback dashboard | Job-specific review that compares the resume to a job description, and a dashboard showing feedback and supporting evidence |
| **Phase 6** | Interactive resume improvement | Accept, reject, or manually edit each suggestion in a separate draft, with undo and restore-original |
| **Phase 7** | DOCX export | Generating a clean, editable DOCX containing only the accepted edits, and checking it by re-reading the generated file |
| **Phase 8** | Supabase integration | Optional accounts and saved review history. **Only started if the core workflow is already working.** |
| **Phase 9** | Complete testing, security review, and bug fixing | Unit, integration, and browser tests, a security and privacy review, and fixing the issues they uncover |

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
