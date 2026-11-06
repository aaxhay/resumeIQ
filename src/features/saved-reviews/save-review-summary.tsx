"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { AiReview } from "@/lib/ai-review/contracts";
import { reviewSummary, savedAnalysisSchema, saveReviewRequestSchema, savedResponseSchema, type SaveReviewRequest } from "@/lib/saved-reviews/contracts";
import { AccountAccess } from "./account-access";
import { accountRequest, requestError, unauthorized } from "./api";
import { SummaryPreview } from "./summary-preview";
import { useAccount } from "./use-account";
import { useBoundedRequest } from "./use-bounded-request";

type Props = { review: AiReview; mode: "general" | "job-specific" };

export function SaveReviewSummary(props: Props) {
  const [opened, setOpened] = useState(false);
  return <details className="min-w-0 rounded-xl border bg-background" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary className="min-h-11 cursor-pointer rounded-xl px-4 py-3 text-sm font-medium">Save review summary <span className="font-normal text-muted-foreground">· optional account</span></summary>
    {opened && <SavePanel {...props} />}
  </details>;
}

function SavePanel({ review, mode }: Props) {
  const account = useAccount();
  // Keep the id across account revalidation/unmounting of authenticated controls.
  const requestIds = useRef(new Map<string, string>());
  const getRequestId = (owner: string) => {
    const existing = requestIds.current.get(owner);
    if (existing) return existing;
    const id = crypto.randomUUID();
    requestIds.current.set(owner, id);
    return id;
  };
  const summary = reviewSummary(review);
  const summaryFits = savedAnalysisSchema.safeParse(summary.analysis_result).success;
  return <div className="space-y-5 border-t p-4 sm:p-5" data-testid="save-review-panel">
    <div><h3 className="font-semibold">Keep a summary, not your resume</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">Review and improve anonymously, or sign in here without leaving your current review or local draft. Nothing is saved automatically.</p></div>
    <AccountAccess state={account} />
    <Notice>
      <p>This saves the exact assessment, three priorities, strengths, limitations, and eligible AI rewrite excerpts shown below to your private account history. Summaries are available for 30 days, then hidden and removed by scheduled cleanup. Provider backups may persist under a separate retention policy. You can delete summaries earlier.</p>
      <p className="mt-2">Snippets and summary text may contain personal information. Check every item. Do not save credentials, secrets, or confidential information.</p>
      <p className="mt-2">The full resume, original filename, job description, complete analysis, improved draft, and edit decisions are not included. Saved summaries cannot restore a draft, re-edit a resume, or recreate a DOCX.</p>
    </Notice>
    <section aria-label="Exact summary preview" className="space-y-4 rounded-xl border bg-card p-4">
      <div><h3 className="font-semibold">Exact summary preview</h3><p className="mt-2 text-xs text-muted-foreground">{mode === "general" ? "General review" : "Job-specific review"} · No filename saved · Rewrite status is pending, not your editing decisions</p></div>
      <SummaryPreview analysis={summary.analysis_result} suggestions={summary.suggestions} />
    </section>
    {!summaryFits ? <Notice role="alert" tone="error">This summary exceeds the saved-history size limit and cannot be saved. Your current review and draft are unchanged. Retrying will not reduce its size; you can continue improving and export your resume without saving this summary.</Notice> : account.account?.user && account.account.historyEnabled && account.account.configured ? <SaveAction key={account.account.user.email} summary={summary} mode={mode} expectedEmail={account.account.user.email} getRequestId={() => getRequestId(account.account!.user!.email)} onUnauthorized={account.expire} /> : <p className="text-sm leading-6 text-muted-foreground">Saving requires an available history service, sign-in, and separate consent below the preview. You can continue improving your resume without saving.</p>}
  </div>;
}

function SaveAction({ summary, mode, expectedEmail, getRequestId, onUnauthorized }: { summary: Pick<SaveReviewRequest, "analysis_result" | "suggestions">; mode: Props["mode"]; expectedEmail: string; getRequestId: () => string; onUnauthorized: (message?: string) => void }) {
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const helpId = useId();
  const request = useBoundedRequest();
  async function save() {
    if (!consent || saved) return;
    const controller = request.start();
    if (!controller) return;
    setError("");
    try {
      const payload = saveReviewRequestSchema.parse({ ...summary, id: getRequestId(), consent: true, expected_account_email: expectedEmail, review_mode: mode, resume_filename: null });
      const result = await accountRequest("/api/review-history", savedResponseSchema, controller.signal, "POST", payload);
      if (result.id !== payload.id) throw new Error("Unconfirmed save");
      if (request.current(controller)) setSaved(true);
    } catch (failure) {
      if (request.current(controller)) {
        if (unauthorized(failure)) onUnauthorized(requestError(failure));
        else setError(requestError(failure));
      }
    } finally { request.finish(controller); }
  }
  return <div className="space-y-4">
    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={consent} disabled={request.pending || saved} onChange={event => setConsent(event.target.checked)} aria-describedby={helpId} /><span>I consent to saving this exact summary and the displayed excerpts to my account with a 30-day history window.</span></label>
    <p id={helpId} className="text-xs leading-6 text-muted-foreground">This is separate from AI-processing consent. Saving does not make another AI request or apply suggested edits. Retry uses the same save ID to avoid duplicate summaries.</p>
    {error && <Notice role="alert" tone="error">{error}</Notice>}
    {saved ? <Notice role="status" tone="success">Summary saved to your account. It is available in history for 30 days, then hidden and removed by scheduled cleanup; provider backups may persist under separate retention. Your local draft is unchanged. Open Account separately to view or delete saved summaries.</Notice> : <Button type="button" variant="outline" disabled={!consent || request.pending} onClick={() => void save()}>{request.pending ? "Saving summary…" : error ? "Retry saving summary" : "Save summary"}</Button>}
  </div>;
}
