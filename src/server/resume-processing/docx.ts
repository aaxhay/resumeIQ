import "server-only";

import mammoth from "mammoth";
import { validateDocxArchive } from "./docx-archive.ts";
import { docxHtmlToText } from "./docx-text.ts";
import { ResumeProcessingError } from "./errors.ts";
import type { RawExtraction } from "./types.ts";

export async function extractDocx(bytes: Buffer): Promise<RawExtraction> {
  await validateDocxArchive(bytes);
  try {
    const result = await mammoth.convertToHtml({ buffer: bytes }, {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      includeDefaultStyleMap: true,
      // Do not read, encode, or embed image bytes. The plain-text pass ignores
      // the empty image element, including any untrusted attributes.
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    });
    return {
      text: docxHtmlToText(result.value),
      // Never expose converter messages: they can contain document contents,
      // paths, relationship URLs, or raw parser errors.
      warnings: result.messages.length ? [{
        code: "conversion",
        message: "Some DOCX formatting or unsupported content could not be preserved. Check the extracted text before continuing.",
      }] : [],
    };
  } catch (error) {
    if (error instanceof ResumeProcessingError) throw error;
    throw new ResumeProcessingError("MALFORMED_FILE", "We couldn’t read this DOCX. Save a fresh DOCX, or paste your resume text instead.");
  }
}
