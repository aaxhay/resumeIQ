"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { deletedResponseSchema, historyListSchema, type SavedReview } from "@/lib/saved-reviews/contracts";
import { AccountAccess } from "./account-access";
import { accountRequest, requestError, unauthorized } from "./api";
import { SummaryPreview } from "./summary-preview";
import { useAccount } from "./use-account";
import { useBoundedRequest } from "./use-bounded-request";

export function AccountHistory({ confirmationFailed = false }: { confirmationFailed?: boolean }) {
  const state = useAccount();
  return <div className="min-w-0 space-y-6">
    {confirmationFailed && <Notice role="alert" tone="error">The confirmation link could not be completed. Try signing in after confirming your email, or create the account again to request another confirmation email.</Notice>}
    <Card><h2 className="mb-4 text-xl font-semibold">Account access</h2><AccountAccess state={state} /></Card>
    {state.account?.configured && state.account.historyEnabled && state.account.user && <SavedHistory key={state.account.user.email} onUnauthorized={state.expire} />}
  </div>;
}

function SavedHistory({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [reviews, setReviews] = useState<SavedReview[] | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const { pending, start, current, finish, cancel } = useBoundedRequest(true);
  const check = useCallback((controller: AbortController) =>
    accountRequest("/api/review-history", historyListSchema, controller.signal)
      .then(result => { if (current(controller)) setReviews(result.reviews); })
      .catch((failure: unknown) => {
        if (current(controller)) {
          if (unauthorized(failure)) onUnauthorized();
          else setError(requestError(failure));
        }
      }).finally(() => finish(controller)), [current, finish, onUnauthorized]);
  async function load() {
    const controller = start();
    if (!controller) return;
    setReviews(null); setError(""); setStatus(""); setDeleting(null);
    await check(controller);
  }
  useEffect(() => {
    const controller = start(false);
    if (controller) void check(controller);
    return () => cancel(false);
  }, [check, start, cancel]);
  async function remove(id: string) {
    if (deleting !== id) return;
    const controller = start();
    if (!controller) return;
    setError(""); setStatus("");
    try {
      await accountRequest(`/api/review-history/${encodeURIComponent(id)}`, deletedResponseSchema, controller.signal, "DELETE", {});
      if (current(controller)) {
        setReviews(values => values?.filter(review => review.id !== id) ?? null);
        setDeleting(null); setStatus("Summary deleted from your account history.");
        title.current?.focus();
      }
    } catch (failure) {
      if (current(controller)) {
        if (unauthorized(failure)) onUnauthorized();
        else setError(requestError(failure));
      }
    } finally { finish(controller); }
  }
  return <Card>
    <section aria-labelledby="saved-history-title" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 ref={title} tabIndex={-1} id="saved-history-title" className="rounded-sm text-xl font-semibold">Saved review summaries</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">Your latest 20 summaries, available in history for 30 days. Older summaries are hidden and removed by scheduled cleanup; provider backups may persist under separate retention. Delete any summary earlier.</p></div><Button type="button" variant="outline" disabled={pending} onClick={() => void load()}>Refresh history</Button></div>
      <Notice>These are summaries and limited rewrite excerpts, not saved resumes. They cannot restore an editing workspace, reproduce a DOCX, or recover your local draft. AI suggestions still need your verification.</Notice>
      {error && <Notice role="alert" tone="error">{error}</Notice>}
      {status && <Notice role="status" tone="success">{status}</Notice>}
      {pending && <p role="status" className="text-sm text-muted-foreground">{reviews ? "Deleting summary…" : "Loading private history…"}</p>}
      {reviews?.length === 0 && <div className="rounded-xl border border-dashed p-6"><h3 className="font-semibold">No saved summaries yet</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">Start a review without an account requirement. After AI feedback, open Save review summary only if you want to keep that summary here.</p></div>}
      {reviews && reviews.length > 0 && <ul className="space-y-4">{reviews.map(review => <li key={review.id} className="min-w-0 rounded-xl border" data-testid="saved-summary">
        <details>
          <summary className="min-h-11 cursor-pointer rounded-xl p-4 text-sm font-medium [overflow-wrap:anywhere]">{review.review_mode === "general" ? "General review" : "Job-specific review"}<span className="ml-2 font-normal text-muted-foreground">{new Date(review.created_at).toLocaleString()}</span>{review.resume_filename && <span className="mt-2 block text-xs text-muted-foreground">{review.resume_filename}</span>}</summary>
          <div className="border-t p-4"><SummaryPreview analysis={review.analysis_result} suggestions={review.resume_suggestions} /></div>
        </details>
        <div className="border-t p-4">
          {deleting === review.id ? <div role="group" aria-label="Confirm summary deletion" className="space-y-3">
            <p className="text-sm leading-6">Delete this saved summary and its excerpts? This cannot be undone. Your current local resume draft is not affected.</p>
            <div className="flex flex-wrap gap-3"><Button autoFocus type="button" variant="destructive" disabled={pending} onClick={() => void remove(review.id)}>Confirm delete</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setDeleting(null); setError(""); title.current?.focus(); }}>Keep summary</Button></div>
          </div> : <Button type="button" variant="ghost" disabled={pending} onClick={() => { setDeleting(review.id); setError(""); setStatus(""); }}>Delete summary</Button>}
        </div>
      </li>)}</ul>}
    </section>
  </Card>;
}
