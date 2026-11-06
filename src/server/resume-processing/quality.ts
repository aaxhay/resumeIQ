import "server-only";
import { MAX_RESUME_CHARACTERS, MIN_RESUME_CHARACTERS, MIN_RESUME_WORDS } from "../../lib/resume/limits.ts";
import type { ExtractionWarning } from "../../lib/resume/contracts.ts";
import { ResumeProcessingError } from "./errors.ts";

export function assessExtraction(text: string): { warnings: ExtractionWarning[]; stats: { characters: number; words: number } } {
  const characters = text.length;
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const readable = text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (characters > MAX_RESUME_CHARACTERS) throw new ResumeProcessingError("TEXT_TOO_LONG", "The extracted text exceeds 80,000 characters. Use a shorter resume or paste the relevant resume text. Nothing was silently truncated.");
  if (!readable) throw new ResumeProcessingError("EMPTY_TEXT", "No readable text was found. This may be an empty or scanned document. Try a text-based PDF/DOCX or paste your resume text. OCR is not available.");
  if (characters < MIN_RESUME_CHARACTERS || words < MIN_RESUME_WORDS || readable < 20) throw new ResumeProcessingError("INSUFFICIENT_TEXT", "Too little readable text was extracted to continue. This may be a scanned or incomplete document—not a poor resume. Try another file or paste the full text.");
  const warnings: ExtractionWarning[] = [];
  if (characters < 200 || words < 35) warnings.push({ code: "low-text", message: "Only a small amount of text was found. Check that all sections are present and add any missing content before confirming. This is an extraction warning, not a resume score." });
  if ((text.match(/�/g)?.length ?? 0) >= 3 || readable / Math.max(characters, 1) < 0.35) warnings.push({ code: "partial", message: "Some text may be unreadable or incomplete. Compare it with your original document, correct any errors, or paste a clean copy." });
  return { warnings, stats: { characters, words } };
}
