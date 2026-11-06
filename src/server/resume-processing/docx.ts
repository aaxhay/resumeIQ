import "server-only";

import mammoth from "mammoth";
import { validateDocxArchive } from "./docx-archive.ts";
import { docxHtmlToText } from "./docx-text.ts";
import { ResumeProcessingError } from "./errors.ts";
import type { RawExtraction } from "./types.ts";

export async function extractDocx(bytes: Buffer): Promise<RawExtraction> {
  const archive = await validateDocxArchive(bytes);
  // Mammoth omits headers and footers without reporting a conversion warning.
  // Do not return an apparently complete resume after dropping contact details
  // or qualifications stored there. The user can supply an exact plain-text copy.
  if (archive.hasHeaderFooterText) {
    throw new ResumeProcessingError("UNSUPPORTED_FORMAT", "This DOCX contains header or footer text that cannot be extracted reliably. Move that text into the document body and save a new DOCX, or paste the complete resume including those details.");
  }
  try {
    const result = await mammoth.convertToHtml({ buffer: bytes }, {
      externalFileAccess: false,
      includeEmbeddedStyleMap: false,
      includeDefaultStyleMap: true,
      // Do not read, encode, or embed image bytes. The plain-text pass ignores
      // the empty image element, including any untrusted attributes.
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    });
    let hasLinkDestinations = false;
    const text = docxHtmlToText(result.value, () => { hasLinkDestinations = true; });
    // Never expose converter messages: they can contain document contents,
    // paths, relationship URLs, or raw parser errors.
    const warnings: RawExtraction["warnings"] = result.messages.length ? [{
      code: "conversion",
      message: "Some DOCX formatting or unsupported content could not be preserved. Check the extracted text before continuing.",
    }] : [];
    if (hasLinkDestinations) warnings.push({
      code: "partial",
      message: "This DOCX contains hyperlinks. Only visible link text is extracted; hidden destinations are not included. Check your original and copy any needed email addresses, contact links, or profile URLs into the visible resume text before confirming or exporting.",
    });
    return { text, warnings };
  } catch (error) {
    if (error instanceof ResumeProcessingError) throw error;
    throw new ResumeProcessingError("MALFORMED_FILE", "We couldn’t read this DOCX. Save a fresh DOCX, or paste your resume text instead.");
  }
}
