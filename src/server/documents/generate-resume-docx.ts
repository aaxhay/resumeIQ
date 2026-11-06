import "server-only";

import { Document, HeadingLevel, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import { exportRequestSchema, exportTextLines, MAX_EXPORT_BYTES } from "../../lib/resume-export/contracts.ts";
import { validateDocxArchive } from "../resume-processing/docx-archive.ts";
import { ResumeExportError } from "./errors.ts";

// Match whole explicit headings only. Names, employers, dates, and unknown sections
// remain ordinary editable paragraphs; no resume fields or missing sections are inferred.
const headings = new Set([
  "summary", "professional summary", "career summary", "profile", "professional profile",
  "objective", "career objective", "experience", "work experience", "professional experience",
  "employment", "employment history", "work history", "relevant experience", "education",
  "academic background", "qualifications", "skills", "technical skills", "core competencies",
  "areas of expertise", "projects", "personal projects", "selected projects", "academic projects",
  "certifications", "certificates", "licenses", "licenses and certifications", "certifications and licenses",
  "awards", "honors", "honors and awards", "achievements", "publications", "research",
  "research experience", "volunteering", "volunteer experience", "leadership", "leadership experience",
  "languages", "interests", "activities", "professional affiliations", "references", "contact", "contact information",
]);

// A leading minus before a number/currency could be a signed metric, not a bullet.
// Never strip numbered lists, dates, C++/C#, or ambiguous punctuation-only lines.
const bulletPrefix = /^(?:[•◦▪●][ \t]+(?=\S)|[-*][ \t]+(?=\p{L}))/u;

function canonicalLines(text: string): string[] {
  return exportTextLines(text).map(line => line.replace(/\s+/gu, " ").trim()).filter(Boolean);
}

/** In-memory, bounded, fresh layout only. No network, filesystem, AI, or source logging. */
export async function generateResumeDocx(text: string): Promise<Buffer> {
  const input = exportRequestSchema.safeParse({ text });
  if (!input.success) throw new ResumeExportError("INVALID_REQUEST");

  const expected: string[] = [];
  let bytes: Buffer;
  try {
    const paragraphs = exportTextLines(input.data.text).filter(line => line.trim()).map(line => {
      const trimmed = line.trim();
      const bullet = bulletPrefix.test(trimmed);
      const content = bullet ? trimmed.replace(bulletPrefix, "") : trimmed;
      expected.push(...canonicalLines(content));
      const heading = !bullet && headings.has(content.replace(/:$/u, "").trim().toLowerCase());
      return new Paragraph({
        children: [new TextRun(content)],
        ...(heading ? { heading: HeadingLevel.HEADING_1, keepNext: true } : {}),
        ...(bullet ? { numbering: { reference: "resume-bullets", level: 0 } } : {}),
        spacing: { before: heading ? 180 : 0, after: heading ? 100 : 80, line: 264 },
        widowControl: true,
      });
    });
    const document = new Document({
      creator: "ResumeIQ",
      title: "",
      description: "",
      styles: {
        default: {
          document: { run: { font: "Arial", size: 22, color: "000000" } },
          heading1: { run: { font: "Arial", size: 26, bold: true, color: "000000" }, paragraph: { keepNext: true } },
        },
      },
      numbering: { config: [{
        reference: "resume-bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•",
          style: { run: { font: "Arial", size: 22 }, paragraph: { indent: { left: 360, hanging: 180 } } },
        }],
      }] },
      sections: [{
        properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: paragraphs,
      }],
    });
    bytes = await Packer.toBuffer(document);
  } catch {
    throw new ResumeExportError("GENERATION_FAILED");
  }

  try {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_EXPORT_BYTES) {
      throw new ResumeExportError("INVALID_DOCUMENT");
    }
    // Validate ZIP/OOXML structure, expansion sizes, CRCs, and relationships before
    // extraction. Do not reuse upload text extraction's smaller 80k text limit.
    await validateDocxArchive(bytes);
    const extracted = await mammoth.extractRawText({ buffer: bytes });
    const actual = canonicalLines(extracted.value);
    if (extracted.messages.length || actual.length !== expected.length
      || actual.some((line, index) => line !== expected[index])) {
      throw new ResumeExportError("INVALID_DOCUMENT");
    }
  } catch {
    throw new ResumeExportError("INVALID_DOCUMENT");
  }
  return bytes;
}
