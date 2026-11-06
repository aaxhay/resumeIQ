import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { ANALYSIS_VERSION, analyzeResume, type ResumeFinding } from "@/lib/resume-analysis";

const CATEGORIES: { value: ResumeFinding["category"]; label: string }[] = [
  { value: "structure", label: "Structure and completeness" },
  { value: "writing", label: "Writing quality" },
  { value: "achievement", label: "Achievement context" },
  { value: "readability", label: "Readability" },
];

type Props = {
  text: string;
  onInspectEvidence: (start: number, end: number) => void;
};

/** Mounted only while the edited text/preferences remain confirmed. */
export function DeterministicReview({ text, onInspectEvidence }: Props) {
  const [findings, setFindings] = useState<ResumeFinding[]>();
  const [projectsRelevant, setProjectsRelevant] = useState(false);
  const [error, setError] = useState<string>();
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => { if (findings) results.current?.focus(); }, [findings]);

  function run() {
    try {
      setFindings(analyzeResume(text, { projectsRelevant }));
      setError(undefined);
    } catch {
      setError("The confirmed text could not be checked. Inspect the text and confirm it again. No resume-quality result was produced.");
      setFindings(undefined);
    }
  }

  return (
    <Card>
      <section aria-labelledby="text-checks-title">
        <p className="eyebrow">No AI · No scores</p>
        <h2 id="text-checks-title" className="mt-2 text-xl font-semibold">Explainable resume text checks</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">These limited, English-oriented rules check the text you confirmed—not the original layout, factual accuracy, hiring suitability, or ATS compatibility. Writing suggestions are optional, and missing numbers do not make a bullet weak.</p>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">Checks run in this browser, without network requests. Both review modes use the same rules; job-description matching and AI review are not implemented.</p>
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={projectsRelevant} onChange={(event) => { setProjectsRelevant(event.target.checked); setFindings(undefined); setError(undefined); }} />
          <span>Projects are relevant to this resume—check for a projects section.<span className="mt-1 block text-xs text-muted-foreground">Optional. Relevance is your choice, not an inference about your career.</span></span>
        </label>
        <Button type="button" className="mt-4" onClick={run} disabled={findings !== undefined}>Run text checks</Button>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Rule set v{ANALYSIS_VERSION}. Editing your resume or changing review preferences clears these results and requires confirmation again.</p>
        {error && <Notice role="alert" tone="error" className="mt-4">{error}</Notice>}
        {findings !== undefined && <div ref={results} tabIndex={-1} className="mt-6 rounded-sm" aria-labelledby="text-check-results-title" data-testid="text-check-results">
          <h3 id="text-check-results-title" className="text-lg font-semibold">Text checks complete</h3>
          <p role="status" className="mt-2 text-sm leading-6">{findings.length ? `${findings.length} observation(s) and suggestion(s) to inspect. This count is not a score.` : "No findings from these limited rules. This is not proof that the resume is complete, error-free, or suitable for a job."}</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">Objective observations describe the supplied text, not necessarily an error in the original. Confidence is a qualitative rule label—not a probability, factual verification, or quality grade. Always check the quoted evidence.</p>
          {CATEGORIES.map((category) => {
            const items = findings.filter((finding) => finding.category === category.value);
            if (!items.length) return null;
            return <section key={category.value} className="mt-7" aria-labelledby={`findings-${category.value}`}>
              <h4 id={`findings-${category.value}`} className="mb-3 font-semibold">{category.label}</h4>
              <ul className="space-y-4">
                {items.map((finding) => <li key={finding.id} className="rounded-xl border p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md bg-muted px-2 py-1">{finding.kind === "objective" ? "Objective observation" : "Optional suggestion"}</span>
                    <span className="rounded-md bg-muted px-2 py-1">{finding.severity === "warning" ? "Warning" : "Info"}</span>
                    <span className="rounded-md bg-muted px-2 py-1">Confidence: {finding.confidence}</span>
                  </div>
                  <h5 className="font-semibold">{finding.title}</h5>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.description}</p>
                  {finding.evidence_location ? <details className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                    <summary className="cursor-pointer leading-6">Evidence · {finding.evidence_location.start_line === finding.evidence_location.end_line ? `line ${finding.evidence_location.start_line}` : `lines ${finding.evidence_location.start_line}–${finding.evidence_location.end_line}`}</summary>
                    <blockquote className="mt-3 max-h-56 overflow-auto border-l-2 border-input pl-3 leading-6 break-words whitespace-pre-wrap">{finding.evidence_text.length > 600 ? `${finding.evidence_text.slice(0, 600)}…` : finding.evidence_text}</blockquote>
                    {finding.evidence_text.length > 600 && <p className="mt-2 text-xs text-muted-foreground">Excerpt: first 600 of {finding.evidence_text.length.toLocaleString()} characters. Inspect the complete range in your editor.</p>}
                    <Button type="button" variant="outline" className="mt-3" onClick={() => { if (finding.evidence_location) onInspectEvidence(finding.evidence_location.start_offset, finding.evidence_location.end_offset); }}>Inspect in editor</Button>
                  </details> : <p className="mt-3 text-xs leading-6 text-muted-foreground">Document-wide check; no specific evidence location. Absence of a recognized pattern is not proof of missing information.</p>}
                  <p className="mt-3 text-sm leading-6"><strong>Recommendation:</strong> {finding.recommendation}</p>
                  <p className="mt-3 text-xs break-all text-muted-foreground">Deterministic rule: {finding.rule_id}</p>
                </li>)}
              </ul>
            </section>;
          })}
        </div>}
      </section>
    </Card>
  );
}
