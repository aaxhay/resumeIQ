"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { MAX_EDIT_TEXT, type ImprovementResult, type ImprovementSession, type ImprovementSuggestion } from "@/lib/resume-improvement/contracts";
import { acceptSuggestion, applicability, chooseTarget, editSuggestion, rejectSuggestion, restoreOriginal, undoLatestEdit } from "@/lib/resume-improvement/editor";

const STATUSES: Record<ImprovementSuggestion["status"], string> = {
  pending: "Pending", accepted: "Accepted", rejected: "Rejected", manually_edited: "Manually edited · not applied",
};
type Mutation = (state: ImprovementSession) => ImprovementResult;

/** Each card's temporary typing buffer is deliberately separate from the saved suggestion. */
function SuggestionCard({ suggestion, session, update }: { suggestion: ImprovementSuggestion; session: ImprovementSession; update: (mutation: Mutation, message: string) => boolean }) {
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(suggestion.suggestedText);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const locked = suggestion.status === "accepted" || suggestion.status === "rejected";
  const eligible = applicability(session, suggestion.id);
  const prefix = `improvement-${suggestion.id}`;
  useEffect(() => {
    if (editing) editor.current?.focus();
    else if (returnFocus.current) { returnFocus.current = false; editButton.current?.focus(); }
  }, [editing]);

  return <article aria-labelledby={`${prefix}-title`} className="min-w-0 space-y-4 rounded-xl border bg-background p-4 sm:p-5" data-testid={`suggestion-${suggestion.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 id={`${prefix}-title`} className="font-semibold [overflow-wrap:anywhere]">Finding: {suggestion.findingId}</h3>
      <p className="rounded-md border px-2 py-1 text-xs font-medium" data-testid="suggestion-status">{STATUSES[suggestion.status]}</p>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <div><h4 className="text-sm font-medium">Original text</h4><p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-7 [overflow-wrap:anywhere]">{suggestion.originalText}</p></div>
      <div><h4 className="text-sm font-medium">Suggested text</h4><p data-testid="suggested-text" className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-7 [overflow-wrap:anywhere]">{suggestion.suggestedText}</p>
        {!suggestion.hasAiRewrite && !suggestion.safetyNote && <p className="mt-2 text-xs leading-6 text-muted-foreground">No AI wording was supplied. The original is an editable starting point, not an improvement already generated.</p>}
      </div>
    </div>
    {suggestion.safetyNote && <Notice>{suggestion.safetyNote}</Notice>}
    <div><h4 className="text-sm font-medium">Why this was recommended</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{suggestion.reason}</p></div>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Evidence reference</summary><p className="mt-3 text-xs text-muted-foreground">Sent preview characters {suggestion.evidence.previewStart + 1}–{suggestion.evidence.previewEnd}. These are not original-resume patch offsets.</p><blockquote className="mt-2 whitespace-pre-wrap border-l-2 pl-3 text-sm leading-7 [overflow-wrap:anywhere]">{suggestion.evidence.quote}</blockquote></details>
    {suggestion.targets.length > 1 && !suggestion.targetLimitExceeded && <div>
      <label htmlFor={`${prefix}-target`} className="text-sm font-medium">Choose intended occurrence</label>
      <select id={`${prefix}-target`} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-sm" value={suggestion.target?.start ?? ""} disabled={locked || editing} onChange={event => { if (event.target.value !== "") update(state => chooseTarget(state, suggestion.id, Number(event.target.value)), "Target selected. Check the surrounding text before accepting."); }}>
        <option value="" disabled>Select a location — repeated text is not replaced automatically</option>
        {suggestion.targets.map((target, index) => <option key={target.start} value={target.start}>Occurrence {index + 1} · line {target.line} · character {target.start + 1}</option>)}
      </select>
    </div>}
    {suggestion.target && <div className="text-xs leading-6 text-muted-foreground"><p>Target in confirmed original: line {suggestion.target.line}, characters {suggestion.target.start + 1}–{suggestion.target.end}.</p><p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">Surrounding text: {suggestion.target.context}</p></div>}
    {editing && <div className="space-y-3 rounded-lg border p-3">
      <label htmlFor={`${prefix}-edit`} className="text-sm font-medium">Edit suggested text</label>
      <Textarea ref={editor} id={`${prefix}-edit`} value={buffer} maxLength={MAX_EDIT_TEXT} onChange={event => setBuffer(event.target.value)} aria-describedby={`${prefix}-manual-help`} />
      <p id={`${prefix}-manual-help`} className="text-xs leading-6 text-muted-foreground">{buffer.length} / {MAX_EDIT_TEXT} characters. User-authored text is not AI-verified. Preserve existing metrics, technologies, job titles, dates, and factual meaning. Add an audience, responsibility, result, measurement, or technology only when you can supply truthful supporting details. Saving does not apply the edit.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!buffer.trim()} onClick={() => { if (update(state => editSuggestion(state, suggestion.id, buffer), "Manual suggestion saved locally. Review it, then accept to apply.")) { returnFocus.current = true; setEditing(false); } }}>Save manual edit</Button>
        <Button type="button" variant="outline" onClick={() => { returnFocus.current = true; setEditing(false); }}>Cancel manual edit</Button>
      </div>
    </div>}
    {!locked && eligible.reason && <p className="text-sm leading-6 text-muted-foreground" id={`${prefix}-blocked`}>{eligible.reason}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={!eligible.canAccept || editing} aria-describedby={!locked && eligible.reason ? `${prefix}-blocked` : undefined} onClick={() => update(state => acceptSuggestion(state, suggestion.id, session.revision, suggestion.originalText), "Edit accepted in the improved draft only. The original is unchanged.")}>Accept suggestion</Button>
      <Button type="button" variant="outline" disabled={locked || editing} onClick={() => update(state => rejectSuggestion(state, suggestion.id), "Suggestion rejected. Neither resume version was changed.")}>Reject suggestion</Button>
      <Button ref={editButton} type="button" variant="outline" disabled={locked || editing} onClick={() => { setBuffer(suggestion.suggestedText); setEditing(true); }}>Edit wording</Button>
    </div>
    {locked && <p className="text-xs leading-6 text-muted-foreground">{suggestion.status === "accepted" ? "Undo accepted edits in reverse order to edit this wording again." : "Rejected suggestions stay locked in this workspace. A new workspace starts a fresh review of decisions."}</p>}
  </article>;
}

/** Memory-only workspace. It outlives upstream review invalidation; never writes back to the source. */
export function ResumeImprovement({ initialSession }: { initialSession: ImprovementSession }) {
  const [session, setSession] = useState(initialSession);
  const latest = useRef(session);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    // Includes unsaved card buffers: opening a workspace means it may hold local work.
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function update(mutation: Mutation, successMessage: string): boolean {
    const result = mutation(latest.current);
    if (!result.ok) { setError(result.error); setMessage(""); return false; }
    latest.current = result.state;
    setSession(result.state);
    setError(""); setMessage(successMessage);
    return true;
  }

  return <section ref={panel} tabIndex={-1} aria-labelledby="improvement-title" className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-6" data-testid="resume-improvement">
    <div><p className="eyebrow">Your decisions · local only</p><h2 id="improvement-title" className="mt-2 text-xl font-semibold">Improve your resume</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Compare each recommendation, edit it if needed, and accept only wording you can verify. Nothing is applied automatically. These controls make no additional AI calls.</p></div>
    <Notice>
      <p>The confirmed original below is immutable. The improved draft is separate and stays available if you change the source, review mode, provider preview, or consent above. It still belongs to this original snapshot, not a new review.</p>
      <p className="mt-2">This workspace is held only in this page’s memory. Copy any text you want to keep before refreshing, closing, or replacing the workspace. No file export or permanent storage is implemented.</p>
      <p className="mt-2">AI wording is limited to conservative removal of leading filler or bullet markers. Other shortening is held back because substring checks alone cannot preserve meaning. If a recommendation needs new facts, supply the specific truthful details yourself or reject it; the application will not invent them.</p>
    </Notice>
    <div className="flex flex-wrap gap-3">
      <Button type="button" variant="outline" disabled={session.history.length === 0} onClick={() => update(undoLatestEdit, "Latest accepted edit undone. Other manual drafts and rejected suggestions were preserved.")}>Undo latest accepted edit</Button>
      <Button type="button" variant="outline" disabled={session.history.length === 0} onClick={() => setConfirmRestore(true)}>Restore original content</Button>
    </div>
    {confirmRestore && <div role="group" aria-label="Confirm restore original" className="space-y-3 rounded-lg border p-4"><p className="text-sm leading-6">Remove all accepted edits from the improved preview? This clears accepted-edit history but keeps manual suggestion drafts and rejections. Your original is already unchanged.</p><div className="flex flex-wrap gap-2"><Button type="button" onClick={() => { update(restoreOriginal, "Original content restored in the preview. Draft suggestions and rejections are preserved; accepted-edit history is empty."); setConfirmRestore(false); }}>Confirm restore</Button><Button type="button" variant="outline" onClick={() => setConfirmRestore(false)}>Keep accepted edits</Button></div></div>}
    <p role="status" className="text-sm leading-6">{message}</p>
    {error && <Notice role="alert" tone="error">{error}</Notice>}
    {session.suggestions.length === 0 && <p className="text-sm leading-7">No evidence-backed editable suggestions were returned. The original and preview remain unchanged; no improvement is fabricated.</p>}
    {session.skippedFindings.length > 0 && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Findings without editable evidence</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{session.skippedFindings.map(item => <li key={item.findingId}>{item.findingId}: {item.reason}</li>)}</ul></details>}
    <div className="space-y-4">{session.suggestions.map(suggestion => <SuggestionCard key={suggestion.id} suggestion={suggestion} session={session} update={update} />)}</div>
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Accepted-edit history ({session.history.length})</summary>{session.history.length === 0 ? <p className="mt-3 text-sm">No accepted edits.</p> : <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{session.history.map(entry => <li key={entry.suggestionId}>{entry.suggestionId} · original characters {entry.start + 1}–{entry.end}{entry.previousSuggestion.status === "manually_edited" ? " · user-authored wording" : " · AI wording"}</li>)}</ol>}</details>
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Confirmed original · unchanged</summary><label htmlFor="improvement-original" className="mt-3 block text-sm font-medium">Original resume snapshot</label><Textarea id="improvement-original" readOnly value={session.originalText} className="mt-2 min-h-64" spellCheck={false} /></details>
    <div><label htmlFor="improvement-preview" className="font-semibold">Improved resume preview</label><p className="my-2 text-xs leading-6 text-muted-foreground">Only accepted edits appear here. Read-only plain text; review the whole resume before using it. Pending, rejected, and unsaved edits are not included.</p><Textarea id="improvement-preview" readOnly value={session.modifiedText} className="min-h-96" spellCheck={false} /></div>
  </section>;
}
