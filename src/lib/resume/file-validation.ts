import { z } from "zod";
import { MAX_FILE_BYTES, MAX_FILE_LABEL } from "./limits.ts";
import type { ResumeErrorCode } from "./contracts.ts";

export type FileCheck = { ok: true; kind: "pdf" | "docx" } | { ok: false; code: ResumeErrorCode; message: string };
const metadataSchema = z.object({ name: z.string().min(1).max(255), size: z.number().int().positive(), type: z.string().max(200) });

export function validateFileMetadata(input: unknown): FileCheck {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "MALFORMED_FILE", message: "This file is empty or unreadable. Choose a non-empty PDF or DOCX." };
  const { name, size, type } = parsed.data;
  if (size > MAX_FILE_BYTES) return { ok: false, code: "FILE_TOO_LARGE", message: `This file is too large. Choose a file no larger than ${MAX_FILE_LABEL}.` };
  const extension = /\.(pdf|docx)$/i.exec(name)?.[1]?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") return { ok: false, code: "UNSUPPORTED_FORMAT", message: "Choose a PDF or DOCX file, or paste your resume text. Images, ZIP files, and older .doc files are not supported." };
  const expectedType = extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const mime = type.toLowerCase();
  if (mime && mime !== "application/octet-stream" && mime !== expectedType) return { ok: false, code: "UNSUPPORTED_FORMAT", message: "The file type does not match its extension. Export a fresh PDF or DOCX and try again." };
  return { ok: true, kind: extension };
}

export function validateFileSignature(bytes: Uint8Array, kind: "pdf" | "docx"): FileCheck {
  // Reject legacy OLE/encrypted Office containers rather than trying to decrypt them.
  const signature = kind === "pdf" ? [0x25, 0x50, 0x44, 0x46, 0x2d] : [0x50, 0x4b, 0x03, 0x04];
  if (!signature.every((value, index) => bytes[index] === value)) return { ok: false, code: "MALFORMED_FILE", message: "This file’s header does not match its format. Export a fresh PDF or DOCX, or paste your resume text instead." };
  return { ok: true, kind };
}
