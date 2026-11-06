import "server-only";

import type { ResumeExportErrorCode } from "../../lib/resume-export/contracts.ts";

export type { ResumeExportErrorCode } from "../../lib/resume-export/contracts.ts";

const messages: Record<ResumeExportErrorCode, string> = {
  INVALID_REQUEST: "Enter non-empty resume text within the export limits, without unsupported characters.",
  BUSY: "Another document is being generated. Try again shortly.",
  GENERATION_FAILED: "The document could not be generated. Your resume text has not changed. Try again.",
  INVALID_DOCUMENT: "The generated document could not be verified. Your resume text has not changed. Try again.",
};

/** Never attach source text, parser errors, or a raw error cause to public failures. */
export class ResumeExportError extends Error {
  readonly code: ResumeExportErrorCode;

  constructor(code: ResumeExportErrorCode) {
    super(messages[code]);
    this.name = "ResumeExportError";
    this.code = code;
  }
}
