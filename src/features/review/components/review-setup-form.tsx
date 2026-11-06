"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useReviewSetup } from "../use-review-setup";
import { JobDescriptionField } from "./job-description-field";
import { ResumeUpload } from "./resume-upload";
import { ReviewModeSelect } from "./review-mode-select";
import { SetupConfirmation } from "./setup-confirmation";
import { DeterministicReview } from "./deterministic-review";
import { AiReview } from "./ai-review";
import { ResumeImprovement } from "./resume-improvement";
import { DownloadCompletion } from "./download-completion";
import { createImprovementSession } from "@/lib/resume-improvement/editor";
import type { ImprovementSession } from "@/lib/resume-improvement/contracts";
import type { AiReview as AiReviewData } from "@/lib/ai-review/contracts";

export function ReviewSetupForm() {
  const setup = useReviewSetup();
  const [workspace, setWorkspace] = useState<{ initial: ImprovementSession; key: number }>();
  const [replacement, setReplacement] = useState<ImprovementSession>();
  const [improvementError, setImprovementError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const hasDownloaded = useRef(false);
  const workspacePanel = useRef<HTMLDivElement>(null);
  const focusWorkspace = useRef(false);
  useEffect(() => {
    const onBackOrForward = () => {
      const show = hasDownloaded.current && window.location.hash === "#download-complete";
      if (!show) focusWorkspace.current = true;
      setDownloadComplete(show);
    };
    window.addEventListener("popstate", onBackOrForward);
    return () => window.removeEventListener("popstate", onBackOrForward);
  }, []);
  useEffect(() => {
    if (!downloadComplete && focusWorkspace.current) {
      focusWorkspace.current = false;
      workspacePanel.current?.focus();
    }
  }, [downloadComplete]);
  function downloadRequested() {
    hasDownloaded.current = true;
    // A same-document route avoids unmounting the draft or revoking its download URL.
    const destination = new URL(window.location.href);
    destination.hash = "download-complete";
    window.history.pushState(window.history.state, "", destination);
    setDownloadComplete(true);
  }
  function returnToReview() {
    const destination = new URL(window.location.href);
    destination.hash = "";
    window.history.replaceState(window.history.state, "", destination);
    focusWorkspace.current = true;
    setDownloadComplete(false);
  }
  const replacementPanel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (replacement) replacementPanel.current?.focus(); }, [replacement]);

  function improve(original: string, review: AiReviewData, sentPreview: string) {
    try {
      const initial = createImprovementSession(original, review, sentPreview);
      setImprovementError("");
      if (workspace) setReplacement(initial);
      else setWorkspace({ initial, key: 0 });
    } catch {
      setImprovementError("The recommendation evidence could not be mapped safely. No draft was created or replaced; your original is unchanged.");
    }
  }
  const fileInput = useRef<HTMLInputElement>(null);
  const pasteInput = useRef<HTMLTextAreaElement>(null);
  const jobInput = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);
  const focusAfterReset = useRef(false);
  const focusPaste = useRef(false);
  const checking = setup.fileState.status === "checking";

  useEffect(() => { if (setup.confirmed) confirmation.current?.focus(); }, [setup.confirmed]);
  useEffect(() => { if (setup.extraction) editor.current?.focus(); }, [setup.extraction]);
  useEffect(() => { if (setup.error) errorPanel.current?.focus(); }, [setup.error]);
  useEffect(() => {
    if (focusAfterReset.current && setup.fileState.status === "empty") {
      focusAfterReset.current = false;
      fileInput.current?.focus();
    }
    if (focusPaste.current && setup.source === "paste") { focusPaste.current = false; pasteInput.current?.focus(); }
  }, [setup.fileState, setup.source]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await setup.extract();
    if (result === "file") fileInput.current?.focus();
    if (result === "paste") pasteInput.current?.focus();
    if (result === "job-description") jobInput.current?.focus();
    if (result === "error") errorPanel.current?.focus();
  }
  function startOver() {
    hasDownloaded.current = false;
    if (downloadComplete) returnToReview();
    focusAfterReset.current = true;
    setWorkspace(undefined); setReplacement(undefined); setImprovementError(""); setConfirmReset(false);
    setup.reset();
  }
  function confirm() {
    const result = setup.confirmText();
    if (result === "editor") editor.current?.focus();
    if (result === "job-description") jobInput.current?.focus();
    if (result === "success") confirmation.current?.focus();
  }
  return (<>
    {downloadComplete && <DownloadCompletion onReturn={returnToReview} onStartOver={startOver} />}
    <div hidden={downloadComplete} className="min-w-0 space-y-6">
      <Card>
        <form noValidate onSubmit={submit} aria-label="Resume review setup">
          <fieldset disabled={setup.processing} className="min-w-0 space-y-8 disabled:opacity-70">
            <fieldset className="flex flex-wrap gap-5">
              <legend className="mb-3 text-sm font-medium">Resume input</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="radio" name="resume-source" value="file" checked={setup.source === "file"} onChange={() => setup.changeSource("file")} className="size-4 accent-primary" /> Upload a file</label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="radio" name="resume-source" value="paste" checked={setup.source === "paste"} onChange={() => setup.changeSource("paste")} className="size-4 accent-primary" /> Paste resume text</label>
            </fieldset>
            {setup.source === "file" ? <ResumeUpload file={setup.fileState.file} checking={checking} error={setup.fileState.error} inputRef={fileInput} onSelect={setup.selectFiles} onRemove={setup.removeFile} /> : <div>
              <label htmlFor="pasted-resume" className="text-lg font-semibold">1. Paste your resume text</label>
              <p id="paste-help" className="my-2 text-sm leading-6 text-muted-foreground">Use this instead of uploading, including when a scan or damaged file cannot be read. Keep headings and bullet points on separate lines.</p>
              <Textarea id="pasted-resume" ref={pasteInput} value={setup.pastedText} onChange={(event) => setup.changePastedText(event.target.value)} aria-describedby="paste-help paste-count" spellCheck={false} />
              <p id="paste-count" className="mt-2 text-xs text-muted-foreground">{setup.pastedText.length.toLocaleString()} / 80,000 characters</p>
            </div>}
            <div className="border-t pt-8"><ReviewModeSelect value={setup.mode} onChange={setup.changeMode} /></div>
            {setup.mode === "job-specific" && <JobDescriptionField value={setup.jobDescription} error={setup.jobError} inputRef={jobInput} onChange={setup.changeJobDescription} onBlur={setup.touchJobDescription} />}
          </fieldset>
          <div className="mt-8 border-t pt-6">
            <p id="setup-action-help" className="mb-4 text-xs leading-6 text-muted-foreground">Extraction sends your file or pasted text to this application’s server. It is processed in memory, not saved by the application or sent to an AI provider. Your job description stays in this browser during extraction. Optional Gemini review below has a separate preview and consent step.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={Boolean(setup.extraction) || setup.processing || checking || (setup.source === "file" ? !setup.fileState.file : !setup.pastedText.trim())} aria-describedby="setup-action-help" className="w-full sm:w-auto">
                {setup.processing ? <><LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Processing resume…</> : <>{setup.source === "file" ? "Extract resume text" : "Prepare pasted text"}<ArrowRight aria-hidden="true" /></>}
              </Button>
              {setup.processing && <Button type="button" variant="outline" onClick={setup.cancel}>Cancel processing</Button>}
              <Button type="button" variant="ghost" onClick={() => { if (workspace) setConfirmReset(true); else startOver(); }}>Start over</Button>
            </div>
            {confirmReset && <div role="group" aria-label="Confirm start over" className="mt-4 space-y-3 rounded-lg border p-4"><p className="text-sm leading-6">Clear the setup, original snapshot, improved draft, and all local decisions? Copy any text you want to keep first. This cannot undo a provider transfer.</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={startOver}>Clear everything and start over</Button><Button type="button" variant="outline" onClick={() => setConfirmReset(false)}>Keep my work</Button></div></div>}
            <p role="status" className="mt-3 text-sm text-muted-foreground">{setup.processing ? "Reading your resume. You can cancel at any time." : setup.extraction ? "Text is ready below. Edit it directly, or replace your input to extract again." : ""}</p>
          </div>
          {setup.error && <Notice ref={errorPanel} tabIndex={-1} tone="error" role="alert" className="mt-4">
            <p>{setup.error}</p>
            {setup.source === "file" && <Button type="button" variant="outline" className="mt-3" onClick={() => { focusPaste.current = true; setup.changeSource("paste"); }}>Use pasted text instead</Button>}
          </Notice>}
        </form>
      </Card>
      {setup.extraction && <Card>
        <div className="mb-5"><p className="eyebrow">Text confirmation</p><h2 className="mt-2 text-xl font-semibold">Inspect and edit your resume text</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Compare every section with your original. Fix missing text, reading order, dates, and bullets. Extraction is not a resume-quality assessment.</p></div>
        {setup.extraction.warnings.length > 0 && <Notice className="mb-5"><ul className="list-disc space-y-2 pl-4">{setup.extraction.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul></Notice>}
        <label htmlFor="resume-editor" className="mb-2 block text-sm font-medium">Editable resume text</label>
        <Textarea id="resume-editor" ref={editor} className="min-h-96" value={setup.editedText} onChange={(event) => setup.changeEditedText(event.target.value)} aria-invalid={Boolean(setup.editError)} aria-describedby={`editor-help editor-count${setup.editError ? " editor-error" : ""}`} spellCheck={false} />
        <p id="editor-count" className="mt-2 text-xs text-muted-foreground">{setup.editedText.length.toLocaleString()} / 80,000 characters{setup.extraction.stats.pages ? ` · ${setup.extraction.stats.pages} PDF page(s)` : ""}</p>
        <p id="editor-help" className="mt-2 text-xs leading-6 text-muted-foreground">Your edits remain in this browser. Confirm only when this text represents the resume you want reviewed. Changing the text or review preferences clears confirmation.</p>
        {setup.editError && <Notice id="editor-error" role="alert" tone="error" className="mt-3">{setup.editError}</Notice>}
        <Button type="button" onClick={confirm} className="mt-5" disabled={setup.confirmed}>Confirm resume text</Button>
        {setup.confirmed && <SetupConfirmation mode={setup.mode} panelRef={confirmation} />}
      </Card>}
      {setup.confirmed && <DeterministicReview text={setup.editedText} onInspectEvidence={(start, end) => {
        editor.current?.focus();
        editor.current?.setSelectionRange(start, end);
        editor.current?.scrollIntoView({ block: "center" });
      }} />}
      {setup.confirmed && <AiReview text={setup.editedText} jobDescription={setup.jobDescription} mode={setup.mode} onImprove={improve} />}
      {improvementError && <Notice role="alert" tone="error">{improvementError}</Notice>}
      {replacement && <Notice ref={replacementPanel} tabIndex={-1}>
        <p className="font-semibold">Replace the current improvement workspace?</p><p className="mt-2">This discards its local edits, rejected suggestions, and undo history. Copy anything you want to keep first. The existing draft remains untouched until you confirm.</p>
        <div className="mt-3 flex flex-wrap gap-3"><Button type="button" onClick={() => { hasDownloaded.current = false; setWorkspace(current => ({ initial: replacement, key: (current?.key ?? 0) + 1 })); setReplacement(undefined); }}>Replace improvement workspace</Button><Button type="button" variant="outline" onClick={() => setReplacement(undefined)}>Keep current workspace</Button></div>
      </Notice>}
      {workspace && <div ref={workspacePanel} tabIndex={-1} className="rounded-xl"><ResumeImprovement key={workspace.key} initialSession={workspace.initial} onDownloadRequested={downloadRequested} /></div>}
    </div>
  </>);
}
