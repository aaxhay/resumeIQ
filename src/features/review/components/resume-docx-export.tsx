"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { DOCX_CONTENT_TYPE, EXPORT_FILENAME, MAX_EXPORT_BYTES, exportRequestSchema, exportFailureSchema } from "@/lib/resume-export/contracts";

const ERRORS = {
  INVALID_REQUEST: "The draft cannot be exported. It must contain nonempty text within the export limits, without unsupported control characters. Your draft is unchanged.",
  BUSY: "Document export is busy. Wait a moment, then try again.",
  GENERATION_FAILED: "The server could not generate the Word document. Your draft is unchanged. Try again when ready.",
  INVALID_DOCUMENT: "The generated document failed its structure or content checks. No file was downloaded. Your draft is unchanged.",
} as const;

/** Remounted on every workspace revision: stale downloads are cancelled, never offered as current. */
export function ResumeDocxExport({ text }: { text: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const current = useRef<AbortController | null>(null);
  const alert = useRef<HTMLDivElement>(null);
  const urls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const downloads = urls.current;
    return () => {
      current.current?.abort(); current.current = null;
      for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
      downloads.clear();
    };
  }, []);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);

  async function download() {
    if (current.current) return;
    const input = exportRequestSchema.safeParse({ text });
    if (!input.success) { setError(ERRORS.INVALID_REQUEST); return; }
    const controller = new AbortController();
    current.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setPending(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/resume/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data), signal: controller.signal });
      if (!response.ok) {
        const parsed = exportFailureSchema.safeParse(await response.json());
        if (current.current === controller) setError(parsed.success ? ERRORS[parsed.data.error.code] : "The export response could not be read. Your draft is unchanged. Try again when ready.");
        return;
      }
      if (response.headers.get("content-type")?.split(";")[0] !== DOCX_CONTENT_TYPE || Number(response.headers.get("content-length")) > MAX_EXPORT_BYTES) throw new Error("Invalid download response");
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_EXPORT_BYTES) throw new Error("Invalid download size");
      const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) throw new Error("Invalid download signature");
      if (current.current !== controller || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urls.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 60_000));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = EXPORT_FILENAME;
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
      setStatus("Download requested. Check your browser’s downloads for improved-resume.docx. If saving was blocked or cancelled, use Download DOCX again. Your original is unchanged.");
    } catch {
      if (current.current === controller) setError("The DOCX download could not be completed or timed out. Your draft is unchanged. Check your connection and try again when ready.");
    } finally {
      clearTimeout(timeout);
      if (current.current === controller) { current.current = null; setPending(false); }
    }
  }

  return <section aria-labelledby="docx-export-title" className="space-y-3 rounded-lg border p-4">
    <h3 id="docx-export-title" className="font-semibold">Download your improved resume</h3>
    <p className="text-sm leading-7 text-muted-foreground">Exports exactly the current improved preview, including accepted AI and accepted manual edits. Pending, rejected, saved-but-unaccepted, and unsaved suggestions are not included. Save and accept any manual wording you want in the file first.</p>
    <p className="text-xs leading-6 text-muted-foreground">This action sends the improved text, including any contact details, to this application’s server to generate and verify an editable Word document. Nothing is sent to Google for export or permanently stored by the application. The clean single-column template does not reproduce your original file’s layout. Dates retain your supplied wording and precision; review inconsistent date wording before export. Empty section headings are retained without invented content.</p>
    <Button type="button" disabled={pending || !text.trim()} onClick={() => { void download(); }}>{pending ? "Generating DOCX…" : "Download DOCX"}</Button>
    <p role="status" className="text-sm leading-6">{pending ? "Generating and checking the current draft. Changing workspace decisions cancels this download; export again after your changes." : status}</p>
    {error && <Notice ref={alert} role="alert" tabIndex={-1} tone="error">{error}</Notice>}
  </section>;
}
