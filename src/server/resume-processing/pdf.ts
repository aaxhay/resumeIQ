import "server-only";
import { PDFParse, PasswordException } from "pdf-parse";
import { MAX_PDF_PAGES, MAX_RESUME_CHARACTERS } from "../../lib/resume/limits.ts";
import { ResumeProcessingError } from "./errors.ts";
import type { RawExtraction } from "./types.ts";

export async function extractPdf(bytes: Buffer): Promise<RawExtraction> {
  if (!bytes.subarray(-4096).includes(Buffer.from("%%EOF"))) throw new ResumeProcessingError("MALFORMED_FILE", "This PDF appears truncated or corrupted. Export a fresh PDF or paste your resume text.");
  const parser = new PDFParse({ data: new Uint8Array(bytes), verbosity: 0, isEvalSupported: false, useWorkerFetch: false, stopAtErrors: true, disableFontFace: true });
  try {
    const info = await parser.getInfo();
    if (info.total > MAX_PDF_PAGES) throw new ResumeProcessingError("RESOURCE_LIMIT", `Choose a resume of ${MAX_PDF_PAGES} pages or fewer, or paste the relevant text.`);
    const result = await parser.getText({ pageJoiner: "", lineEnforce: true, cellSeparator: "  " });
    const text = result.pages.map((page) => page.text).join("\n\n");
    if (text.length > MAX_RESUME_CHARACTERS) throw new ResumeProcessingError("TEXT_TOO_LONG", "The PDF contains more than 80,000 characters. Use a shorter file or paste the relevant text. Nothing was silently truncated.");
    const warnings: RawExtraction["warnings"] = [{ code: "layout", message: "PDF reading order and spacing can change during extraction, especially in columns or tables. Check headings, bullets, dates, and section order against your original." }];
    if (result.pages.some((page) => page.text.trim().length < 20)) warnings.push({ code: "partial", message: "At least one page yielded little or no text. It may be blank, scanned, or incomplete. Check all pages and paste missing content before confirming." });
    return { text, pages: info.total, warnings };
  } catch (error: unknown) {
    if (error instanceof ResumeProcessingError) throw error;
    if (error instanceof PasswordException) throw new ResumeProcessingError("PROTECTED_FILE", "This PDF is password-protected. Export an unprotected copy or paste your resume text.");
    throw new ResumeProcessingError("MALFORMED_FILE", "We couldn’t read this PDF reliably. It may be damaged or unsupported. Export a fresh PDF or paste your resume text; this is not a resume-quality result.");
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
