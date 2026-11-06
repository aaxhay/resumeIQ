# Server DOCX export

`generate-resume-docx.ts` uses the runtime `docx` dependency to generate a clean, editable Word document from the current improved text. Before returning bytes, it validates the archive and re-extracts its text to check content preservation. No AI, disk storage, inferred sections, or original-layout reproduction.

The route is `POST /api/resume/export`. Shared contracts live in `src/lib/resume-export`; see `docs/docx-export.md` for limits, formatting, privacy, and verification. Existing upload extraction lives in `src/server/resume-processing`.
