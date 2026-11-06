import { useRef, useState, type DragEvent, type RefObject } from "react";
import { FileCheck2, LoaderCircle, UploadCloud, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { FILE_ACCEPT, formatFileSize, MAX_FILE_LABEL } from "../validation";

type ResumeUploadProps = {
  file: File | null;
  checking: boolean;
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onSelect: (files: readonly File[]) => void;
  onRemove: () => void;
};

export function ResumeUpload({ file, checking, error, inputRef, onSelect, onRemove }: ResumeUploadProps) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  return (
    <section aria-labelledby="upload-title">
      <div className="mb-5"><h2 id="upload-title" className="text-lg font-semibold">1. Add your resume</h2><p id="upload-help" className="mt-1 text-sm leading-6 text-muted-foreground">One PDF or DOCX, up to {MAX_FILE_LABEL}. Choose a text-based document, not a scan.</p></div>
      <div
        data-testid="resume-dropzone"
        aria-busy={checking}
        onDragEnter={onDragEnter}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); dragDepth.current = 0; onSelect(Array.from(event.dataTransfer.files)); }}
        className={cn("rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors sm:px-6", dragging ? "border-primary bg-accent" : "border-input bg-background hover:border-primary/60", error && "border-destructive/60")}
      >
        {checking ? <LoaderCircle aria-hidden="true" className="mx-auto mb-4 size-7 animate-spin text-primary motion-reduce:animate-none" /> : <UploadCloud aria-hidden="true" className="mx-auto mb-4 size-7 text-primary" />}
        <p className="font-medium">{checking ? "Checking your file…" : dragging ? "Drop your resume here" : file ? "Want to use a different resume?" : "Drop your resume here"}</p>
        <p className="mt-1 text-sm text-muted-foreground">or choose a file from your device</p>
        <label className={cn(buttonVariants({ variant: "outline" }), "relative mt-5 cursor-pointer focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-ring", checking && "cursor-wait opacity-60")}>
          <input
            ref={inputRef}
            id="resume-file"
            aria-label="Choose resume file"
            type="file"
            accept={FILE_ACCEPT}
            disabled={checking}
            aria-invalid={Boolean(error)}
            aria-describedby={`upload-help local-file-note${error ? " file-error" : ""}`}
            className="sr-only"
            onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; onSelect(files); }}
          />
          {file ? "Replace file" : "Choose file"}
        </label>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {checking && <p className="mt-3 text-sm text-muted-foreground">Checking size, type, and file header on your device.</p>}
        {file && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border bg-accent/50 p-4">
            <FileCheck2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium break-all">{file.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{formatFileSize(file.size)} · Selected locally · Basic checks passed</p></div>
            <Button type="button" variant="ghost" className="size-11 shrink-0 p-2" aria-label="Remove selected resume" onClick={() => { onRemove(); inputRef.current?.focus(); }}><X aria-hidden="true" /></Button>
          </div>
        )}
      </div>
      {error && <Notice id="file-error" tone="error" role="alert" className="mt-3">{error}</Notice>}
      <p id="local-file-note" className="mt-3 text-xs leading-6 text-muted-foreground">Selecting a file does not upload it. Choose Extract resume text to send it to the server for validation and extraction.</p>
    </section>
  );
}
