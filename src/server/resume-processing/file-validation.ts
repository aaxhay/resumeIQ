import "server-only";
import { validateFileMetadata, validateFileSignature } from "../../lib/resume/file-validation.ts";
import { ResumeProcessingError } from "./errors.ts";
import type { DocumentKind } from "./types.ts";

export function validateDocument(bytes: Uint8Array, name: string, mimeType: string): DocumentKind {
  const metadata = validateFileMetadata({ name, type: mimeType, size: bytes.byteLength });
  if (!metadata.ok) throw new ResumeProcessingError(metadata.code, metadata.message);
  const signature = validateFileSignature(bytes, metadata.kind);
  if (!signature.ok) throw new ResumeProcessingError(signature.code, signature.message);
  return metadata.kind;
}
