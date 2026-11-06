import "server-only";
import type { ExtractionResult } from "../../lib/resume/contracts.ts";
import { extractPdf } from "./pdf.ts";
import { extractDocx } from "./docx.ts";
import { normalizeResumeText } from "./normalize.ts";
import { assessExtraction } from "./quality.ts";
import type { ProcessingInput, RawExtraction } from "./types.ts";

export async function processResume(input: ProcessingInput): Promise<ExtractionResult> {
  const raw: RawExtraction = input.kind === "pasted"
    ? { text: input.text, warnings: [] }
    : input.kind === "pdf" ? await extractPdf(Buffer.from(input.bytes)) : await extractDocx(Buffer.from(input.bytes));
  const text = normalizeResumeText(raw.text);
  const quality = assessExtraction(text);
  return {
    source: input.kind,
    text,
    warnings: [...raw.warnings, ...quality.warnings].slice(0, 10),
    stats: { ...quality.stats, ...(raw.pages ? { pages: raw.pages } : {}) },
  };
}
