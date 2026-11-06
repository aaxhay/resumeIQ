"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { availabilitySchema, MAX_AI_TEXT, reviewRequestSchema, reviewResponseSchema, type AiReview as Review } from "@/lib/ai-review/contracts";
import { prepareAiText } from "@/lib/ai-review/privacy";
import type { ReviewMode } from "../review-options";

type Availability = ReturnType<typeof availabilitySchema.parse>;
type Response = ReturnType<typeof reviewResponseSchema.parse>;
type Success = Extract<Response, { ok: true }>;
const ERROR_MESSAGES: Record<Extract<Response, { ok: false }>["error"]["code"], string> = {
  INVALID_REQUEST: "The request was rejected. Check the preview lengths and consent before trying again.",
  NOT_CONFIGURED: "Gemini review is not configured. Local text checks are still available.",
  PRIVACY_GATE: "The server privacy gate rejected this request. Only synthetic, non-confidential documents may be allowed.",
  BUSY: "Gemini review is busy. Wait a moment before retrying.",
  DUPLICATE: "This request has already been submitted. No new review was started. Wait before retrying.",
  RATE_LIMIT: "The review limit has been reached. Wait before retrying.",
  TIMEOUT: "Gemini review timed out. A provider charge may still apply. You can retry explicitly.",
  CANCELLED: "The review was cancelled. A provider charge may still apply.",
  INVALID_RESPONSE: "The response could not be validated. No AI feedback is shown. You can retry explicitly.",
  PROVIDER_ERROR: "Gemini could not complete this review. Your previews are preserved. You can retry explicitly.",
};
const STATUS_LABELS = { supported: "Supported", partially_supported: "Partially supported", not_evidenced: "Not evidenced", not_assessed: "Not assessed" };
const label = (value: string) => value.replaceAll("_", " ");

function Evidence({ quotes, source = "Resume preview" }: { quotes: string[]; source?: string }) {
  return quotes.length ? <div className="mt-3 space-y-2 text-sm">
    <p className="font-medium">{source} evidence</p>
    {quotes.map((quote, index) => <blockquote key={index} className="border-l-2 border-input pl-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{quote}</blockquote>)}
  </div> : <p className="mt-3 text-xs text-muted-foreground">No specific resume-preview citation supplied.</p>;
}

function Feedback({ data, mode }: { data: Review; mode: ReviewMode }) {
  return <div className="space-y-7 text-sm leading-6 [overflow-wrap:anywhere]">
    <section><h4 className="font-semibold">Overall assessment</h4><p className="mt-2">{data.assessment}</p></section>
    <section aria-labelledby="ai-priorities"><h4 id="ai-priorities" className="font-semibold">Three priorities</h4>
      <ol className="mt-3 list-decimal space-y-4 pl-5">{data.priorities.map((item, index) => <li key={index}><h5 className="font-medium">{item.title}</h5><p>{item.recommendation}</p><Evidence quotes={item.resumeEvidence} /></li>)}</ol>
    </section>
    <section><h4 className="font-semibold">Strengths</h4><ul className="mt-3 space-y-4">{data.strengths.map((item, index) => <li key={index}><h5 className="font-medium">{item.title}</h5><p>{item.explanation}</p><Evidence quotes={item.resumeEvidence} /></li>)}</ul></section>
    <section><h4 className="font-semibold">Coverage areas</h4><ul className="mt-3 space-y-3">{data.areas.map((item, index) => <li key={index}><span className="font-medium capitalize">{item.area}</span> · {item.status === "assessed" ? "Assessed" : "Not assessed"}<p className="text-muted-foreground">{item.explanation}</p></li>)}</ul></section>
    <section><h4 className="font-semibold">Findings and evidence</h4>
      {!data.findings.length && <p className="mt-2">No specific findings returned. This does not mean the resume is complete or error-free.</p>}
      <ul className="mt-3 space-y-4">{data.findings.map((item, index) => <li key={index} className="rounded-xl border p-4">
        <p className="text-xs capitalize">{item.area} · {item.impact} impact (AI judgment)</p><h5 className="mt-2 font-medium">{item.issue}</h5>
        <p className="mt-2"><strong>Why it matters:</strong> {item.whyItMatters}</p><p className="mt-2"><strong>Recommendation:</strong> {item.recommendation}</p>
        <Evidence quotes={item.resumeEvidence} />
        {item.suggestedRewrite && <div className="mt-4 rounded-lg bg-muted/50 p-3"><h6 className="font-medium">Optional extractive rewrite · not applied</h6><p className="mt-2">Verify the meaning and facts before using it. Nothing is changed in your resume.</p><p className="mt-3 font-medium">Original preview text</p><blockquote className="whitespace-pre-wrap">{item.suggestedRewrite.original}</blockquote><p className="mt-3 font-medium">Suggested wording</p><blockquote className="whitespace-pre-wrap">{item.suggestedRewrite.revised}</blockquote></div>}
      </li>)}</ul>
    </section>
    {mode === "job-specific" && <section><h4 className="font-semibold">Job evidence comparison</h4><p className="mt-2">“Not evidenced” means the supplied resume preview does not demonstrate a requirement—not that you lack the skill. These are AI judgments, not hiring decisions.</p>
      {!data.jobMatches.length && <p className="mt-2">No job comparisons returned; no fit conclusion can be drawn.</p>}
      <ul className="mt-3 space-y-4">{data.jobMatches.map((item, index) => <li key={index} className="rounded-xl border p-4"><p className="text-xs capitalize">{label(item.category)}</p><h5 className="mt-2 font-medium">{item.requirement}</h5><p className="mt-2 font-medium">{STATUS_LABELS[item.status]}</p><p className="mt-2">{item.explanation}</p><Evidence quotes={[item.jobEvidence]} source="Job description preview" /><Evidence quotes={item.resumeEvidence} /><p className="mt-3"><strong>Recommendation:</strong> {item.recommendation}</p></li>)}</ul>
    </section>}
    <section><h4 className="font-semibold">Review limitations</h4><ul className="mt-2 list-disc space-y-2 pl-5">{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></section>
  </div>;
}

/** Mount only while upstream text and review preferences are confirmed. */
export function AiReview({ text, jobDescription, mode }: { text: string; jobDescription: string; mode: ReviewMode }) {
  const [resumePreview, setResumePreview] = useState(() => prepareAiText(text));
  const [jobPreview, setJobPreview] = useState(() => prepareAiText(jobDescription));
  const [consent, setConsent] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [availability, setAvailability] = useState<Availability>();
  const [availabilityError, setAvailabilityError] = useState(false);
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<Success>();
  const request = useRef<AbortController | null>(null);
  const resultsPanel = useRef<HTMLDivElement>(null);
  const errorPanel = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLButtonElement>(null);
  const resumeInput = useRef<HTMLTextAreaElement>(null);
  const jobInput = useRef<HTMLTextAreaElement>(null);
  const invalidInput = useRef<HTMLTextAreaElement | null>(null);
  const focusAfterCancel = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    async function check() {
      try {
        const response = await fetch("/api/reviews", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Availability unavailable");
        const parsed = availabilitySchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("Invalid availability");
        if (active) setAvailability(parsed.data);
      } catch {
        if (active) setAvailabilityError(true);
      } finally { window.clearTimeout(timeout); }
    }
    void check();
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [availabilityAttempt]);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  useEffect(() => { if (result) resultsPanel.current?.focus(); }, [result]);
  useEffect(() => {
    if (error) (invalidInput.current ?? errorPanel.current)?.focus();
  }, [error]);
  useEffect(() => {
    if (!pending && focusAfterCancel.current) { focusAfterCancel.current = false; action.current?.focus(); }
  }, [pending]);

  function invalidate() {
    const wasPending = Boolean(request.current);
    request.current?.abort();
    request.current = null;
    setPending(false);
    setResult(undefined);
    setError(undefined);
    setStatus(wasPending ? "Request cancelled because the preview or consent changed. The server may still complete the request and bill for it." : "Previous AI feedback cleared. Review the current previews and consent before sending again.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || result || !availability?.configured || !consent || (!availability.personalDataEnabled && !synthetic)) return;
    invalidInput.current = null;
    const parsed = reviewRequestSchema.safeParse({ mode, resumeText: resumePreview, ...(mode === "job-specific" ? { jobDescription: jobPreview } : {}), confirmed: true, consent: true, synthetic, requestId: crypto.randomUUID() });
    if (!parsed.success) {
      setError("Check your previews: the resume needs 40–30,000 characters and at least eight words; a job description needs 50–10,000 characters. No AI request was sent.");
      invalidInput.current = parsed.error.issues.some((issue) => issue.path[0] === "resumeText") ? resumeInput.current : jobInput.current;
      invalidInput.current?.focus();
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 75_000);
    setPending(true);
    setError(undefined);
    setStatus("Sending only the reviewed previews to Google Gemini. You can cancel waiting, but the server may still complete and bill for the request.");
    try {
      const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), signal: controller.signal });
      const payload = reviewResponseSchema.safeParse(await response.json());
      if (request.current !== controller) return;
      if (!payload.success || (payload.data.ok && !response.ok)) {
        setError(ERROR_MESSAGES.INVALID_RESPONSE);
      } else if (!payload.data.ok) {
        setError(ERROR_MESSAGES[payload.data.error.code]);
      } else {
        setResult(payload.data);
      }
      setStatus("");
    } catch {
      if (request.current === controller) {
        setError("The review could not be received. Your previews are preserved. A provider charge may still apply; retry only when you are ready.");
        setStatus("");
      }
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  }

  return <Card>
    <section aria-labelledby="ai-review-title" className="min-w-0 space-y-5">
      <div><p className="eyebrow">Optional · Google Gemini · No scores</p><h2 id="ai-review-title" className="mt-2 text-xl font-semibold">Gemini AI review</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Separate from local deterministic text checks. Confirmation does not send anything to Gemini. Only the explicit action below sends your reviewed previews through this application’s server to Google.</p></div>
      <Notice>
        <p>Best-effort redaction is not anonymity. Review both previews as applicable, and remove names, addresses, and unnecessary personal information yourself. Contact details may be missed; context can still identify someone.</p>
        <p className="mt-2">The default is synthetic-only because Google’s unpaid-service terms prohibit personal or confidential documents. Do not mark a real document as synthetic just because it was redacted. Read the <a className="font-medium underline underline-offset-4" href="https://aistudio.google.com/docs/terms" target="_blank" rel="noreferrer">official Google AI Studio terms (opens in a new tab)</a>.</p>
        {availability?.personalDataEnabled && <p className="mt-2">This deployment permits personal-data requests by operator configuration. This is not detection or verification of a paid tier. Follow the applicable Google terms and do not send confidential information.</p>}
      </Notice>
      <div role="status" className="text-sm leading-6">
        {availabilityError ? "Gemini availability could not be verified. Sending is disabled; local text checks still work." : !availability ? "Checking Gemini availability…" : !availability.configured ? "Gemini review is not configured. Sending is disabled; local text checks still work." : availability.personalDataEnabled ? "Gemini review is configured. Explicit consent is still required." : "Gemini review is configured for synthetic, non-confidential documents only."}
      </div>
      {availabilityError && <Button type="button" variant="outline" onClick={() => { setAvailabilityError(false); setAvailability(undefined); setAvailabilityAttempt((value) => value + 1); }}>Retry availability check</Button>}
      <form onSubmit={submit} noValidate className="space-y-5" aria-label="Gemini review consent and previews">
        <div><label htmlFor="ai-resume-preview" className="font-medium">Resume preview to send</label><Textarea ref={resumeInput} id="ai-resume-preview" className="mt-2 min-h-64" value={resumePreview} onChange={(event) => { invalidate(); setResumePreview(event.target.value); }} aria-describedby={`ai-preview-help ai-resume-count${error ? " ai-review-error" : ""}`} spellCheck={false} /><p id="ai-resume-count" className="mt-2 text-xs text-muted-foreground">{resumePreview.length.toLocaleString()} / {MAX_AI_TEXT.toLocaleString()} characters · minimum 40 characters and eight words</p></div>
        {mode === "job-specific" && <div><label htmlFor="ai-job-preview" className="font-medium">Job description preview to send</label><Textarea ref={jobInput} id="ai-job-preview" className="mt-2" value={jobPreview} onChange={(event) => { invalidate(); setJobPreview(event.target.value); }} aria-describedby={`ai-preview-help ai-job-count${error ? " ai-review-error" : ""}`} spellCheck={false} /><p id="ai-job-count" className="mt-2 text-xs text-muted-foreground">{jobPreview.length.toLocaleString()} / 10,000 characters · minimum 50 characters</p></div>}
        <p id="ai-preview-help" className="text-xs leading-6 text-muted-foreground">Only these previews are sent—not your original editor text or file. Preview edits do not change the resume editor. Evidence references the sent previews, not locations in the original editor. Changing a preview or checkbox clears AI feedback and cancels any pending request.</p>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={synthetic} onChange={(event) => { invalidate(); setSynthetic(event.target.checked); }} /><span>These documents are synthetic and contain no real personal or confidential information.{!availability?.personalDataEnabled && " Required for this deployment."}</span></label>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={consent} onChange={(event) => { invalidate(); setConsent(event.target.checked); }} /><span>I consent to transferring these previews to Google for Gemini processing. I am 18 or older and am using the service from a supported region under the Google terms.</span></label>
        <p id="ai-action-help" className="text-xs leading-6 text-muted-foreground">Review and minimize the previews, then give explicit consent{!availability?.personalDataEnabled ? " and confirm synthetic-only content" : ""}. The server may make one additional validation-correction call within the same deadline; both calls may be billed. Network failures are not automatically retried. Cancellation stops waiting in this browser; the server may still complete the request and bill for it.</p>
        <div className="flex flex-wrap gap-3"><Button ref={action} type="submit" className="w-full sm:w-auto" aria-describedby="ai-action-help" disabled={!availability?.configured || availabilityError || !consent || (!availability.personalDataEnabled && !synthetic) || pending || Boolean(result)}>{pending ? "Requesting Gemini review…" : error ? "Retry Gemini review" : "Send previews to Gemini"}</Button>
          {pending && <Button type="button" variant="outline" onClick={() => { focusAfterCancel.current = true; invalidate(); setStatus("Request cancelled in this browser. The server may still complete the request and bill for it."); }}>Cancel Gemini review</Button>}
        </div>
      </form>
      <p role="status" className="text-sm leading-6 text-muted-foreground">{result ? "Gemini feedback is ready. Inspect the evidence and limitations below." : status}</p>
      {error && <Notice id="ai-review-error" ref={errorPanel} tabIndex={-1} role="alert" tone="error"><p>{error}</p><p className="mt-2">No AI feedback is shown. Check the previews, then use Retry Gemini review to make a new request. Local checks remain available.</p></Notice>}
      {result && <div ref={resultsPanel} tabIndex={-1} aria-labelledby="ai-results-title" data-testid="ai-review-results" className="min-w-0 space-y-5 rounded-sm border-t pt-5">
        <div><h3 id="ai-results-title" className="text-lg font-semibold">Gemini review complete</h3><p className="mt-2 text-xs [overflow-wrap:anywhere]">Response model: {result.model}</p></div>
        <Notice>Exact citations are checked against the submitted text, but semantic claims may still be wrong. This is not factual verification, an ATS score, or a hiring guarantee. Verify every suggestion. {result.redacted && "Additional best-effort redaction was applied by the server; some citations may contain redaction placeholders."} Evidence refers to the sent previews, not the original editor.</Notice>
        <Feedback data={result.data} mode={mode} />
      </div>}
    </section>
  </Card>;
}
