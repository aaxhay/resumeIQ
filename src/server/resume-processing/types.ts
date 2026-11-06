import type { ExtractionWarning } from "../../lib/resume/contracts.ts";

export type DocumentKind = "pdf" | "docx";
export type RawExtraction = {
  text: string;
  warnings: ExtractionWarning[];
  pages?: number;
};

export type ProcessingInput =
  | { kind: DocumentKind; bytes: Uint8Array }
  | { kind: "pasted"; text: string };
