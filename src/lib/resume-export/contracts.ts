import { z } from "zod";

export const MAX_EXPORT_TEXT = 110_000;
export const MAX_EXPORT_PARAGRAPHS = 4_000;
/** Responses must also fit Vercel's 4.5 MB function payload limit. */
export const MAX_EXPORT_BYTES = 4 * 1024 * 1024;
export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const EXPORT_FILENAME = "improved-resume.docx";

/** XML 1.0 characters only; iteration by code point also detects lone UTF-16 surrogates. */
function isXmlText(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code !== 9 && code !== 10 && code !== 13
      && !(code >= 0x20 && code <= 0xd7ff)
      && !(code >= 0xe000 && code <= 0xfffd)
      && !(code >= 0x10000 && code <= 0x10ffff)) return false;
  }
  return true;
}

export function exportTextLines(text: string): string[] {
  return text.split(/\r\n?|\n|\u{2028}|\u{2029}/u);
}

export const exportRequestSchema = z.object({
  // The pipeline prevents scanning/splitting an oversized value after a failed size check.
  text: z.string().min(1).max(MAX_EXPORT_TEXT).pipe(z.string()
    .refine(text => text.trim().length > 0, "Enter non-empty resume text.")
    .refine(isXmlText, "Resume text contains unsupported characters.")
    .refine(text => exportTextLines(text).length <= MAX_EXPORT_PARAGRAPHS, "Resume text has too many paragraphs.")),
}).strict();

export const exportErrorCodeSchema = z.enum(["INVALID_REQUEST", "BUSY", "GENERATION_FAILED", "INVALID_DOCUMENT"]);
export const exportFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: exportErrorCodeSchema, message: z.string() }).strict(),
}).strict();

export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportFailure = z.infer<typeof exportFailureSchema>;
export type ResumeExportErrorCode = z.infer<typeof exportErrorCodeSchema>;
