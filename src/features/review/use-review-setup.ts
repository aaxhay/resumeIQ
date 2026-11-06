"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewMode } from "./review-options";
import { getJobDescriptionError, inspectResumeFile, reviewSetupSchema } from "./validation";
import { extractionResponseSchema, resumeTextSchema, type ExtractionResult } from "@/lib/resume/contracts";
import { MAX_RESUME_CHARACTERS } from "@/lib/resume/limits";

type FileState =
  | { status: "empty" | "checking"; file: null; error?: undefined }
  | { status: "ready"; file: File; error?: undefined }
  | { status: "error"; file: null; error: string };

export function useReviewSetup() {
  const [fileState, setFileState] = useState<FileState>({ status: "empty", file: null });
  const [source, setSource] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
  const [mode, setMode] = useState<ReviewMode>("general");
  const [jobDescription, setJobDescription] = useState("");
  const [jobTouched, setJobTouched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const [extraction, setExtraction] = useState<ExtractionResult>();
  const [editedText, setEditedText] = useState("");
  const [editError, setEditError] = useState<string>();
  const fileRequest = useRef(0);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => { fileRequest.current += 1; requestId.current += 1; controller.current?.abort(); }, []);

  function cancel() {
    requestId.current += 1;
    controller.current?.abort();
    controller.current = null;
    setProcessing(false);
  }
  function clearExtraction() {
    cancel();
    setExtraction(undefined);
    setEditedText("");
    setEditError(undefined);
    setError(undefined);
    setConfirmed(false);
  }
  async function selectFiles(files: readonly File[]) {
    if (files.length === 0) return;
    const currentRequest = ++fileRequest.current;
    clearExtraction();
    const file = files[0];
    if (files.length !== 1 || !file) {
      setFileState({ status: "error", file: null, error: "Choose one resume at a time. Drop a single PDF or DOCX file." });
      return;
    }
    setFileState({ status: "checking", file: null });
    const result = await inspectResumeFile(file);
    if (fileRequest.current !== currentRequest) return;
    setFileState(result.ok ? { status: "ready", file } : { status: "error", file: null, error: result.message });
  }
  function removeFile() {
    fileRequest.current += 1;
    setFileState({ status: "empty", file: null });
    clearExtraction();
  }
  function changeSource(value: "file" | "paste") {
    removeFile();
    setSource(value);
  }
  function changeMode(value: ReviewMode) { setMode(value); setConfirmed(false); }
  function changeJobDescription(value: string) { setJobDescription(value); setConfirmed(false); }
  function changePastedText(value: string) { clearExtraction(); setPastedText(value); }
  function changeEditedText(value: string) { setEditedText(value); setConfirmed(false); setEditError(undefined); }

  async function extract(): Promise<"file" | "paste" | "job-description" | "editor" | "error" | undefined> {
    if (controller.current) return;
    // Repeated extraction must not discard corrections. Replacing the source
    // explicitly clears extraction; preference changes do not require parsing.
    if (extraction) return "editor";
    setJobTouched(true);
    if (!reviewSetupSchema.safeParse({ mode, jobDescription }).success) return "job-description";
    if (source === "file" && !fileState.file) return "file";
    if (source === "paste" && (!pastedText.trim() || pastedText.length > MAX_RESUME_CHARACTERS)) {
      setError("Paste your resume text, up to 80,000 characters.");
      return "paste";
    }
    clearExtraction();
    const currentRequest = ++requestId.current;
    const abort = new AbortController();
    controller.current = abort;
    setProcessing(true);
    const timer = setTimeout(() => abort.abort(), 40_000);
    try {
      const body = new FormData();
      if (fileState.file) body.append("file", fileState.file);
      const response = await fetch("/api/resume/extract", {
        method: "POST", signal: abort.signal, cache: "no-store",
        ...(source === "paste" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: pastedText }) } : { body }),
      });
      const json: unknown = await response.json();
      const result = extractionResponseSchema.safeParse(json);
      if (requestId.current !== currentRequest) return;
      if (!result.success) throw new Error("Invalid response");
      if (!result.data.ok) { setError(result.data.error.message); return "error"; }
      setExtraction(result.data.data);
      setEditedText(result.data.data.text);
      return "editor";
    } catch {
      if (requestId.current !== currentRequest) return;
      setError(abort.signal.aborted ? "The request timed out. Try again or paste your resume text." : "We couldn’t reach the document processor. Your input is still here. Please try again or paste your resume text.");
      return "error";
    } finally {
      clearTimeout(timer);
      if (requestId.current === currentRequest) { setProcessing(false); controller.current = null; }
    }
  }
  function confirmText(): "job-description" | "editor" | "success" {
    setJobTouched(true);
    if (!reviewSetupSchema.safeParse({ mode, jobDescription }).success) return "job-description";
    const parsed = resumeTextSchema.safeParse(editedText);
    if (!extraction || !parsed.success) {
      setEditError(parsed.error?.issues[0]?.message ?? "Extract or paste your resume before confirming.");
      return "editor";
    }
    setConfirmed(true);
    return "success";
  }
  function reset() {
    removeFile(); setSource("file"); setPastedText(""); setMode("general"); setJobDescription(""); setJobTouched(false);
  }
  return {
    fileState, source, pastedText, mode, jobDescription, confirmed, processing, error, extraction, editedText, editError,
    jobError: mode === "job-specific" && jobTouched ? getJobDescriptionError(jobDescription) : undefined,
    selectFiles, removeFile, changeSource, changePastedText, changeMode, changeJobDescription, changeEditedText,
    extract, confirmText, cancel, reset, touchJobDescription: () => setJobTouched(true),
  };
}
