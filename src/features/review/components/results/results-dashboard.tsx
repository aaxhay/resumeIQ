import type { AiReview } from "@/lib/ai-review/contracts";
import type { JobAnalysis } from "@/lib/job-description/analysis-contracts";
import type { ReviewMode } from "../../review-options";
import { groupFindings } from "../../results-model";
import { Evidence } from "./evidence";
import { JobEvidenceComparison } from "./job-comparison";
import { RecommendationCard } from "./recommendation-card";

export type ResultsDashboardProps = {
  data: AiReview;
  mode: ReviewMode;
  jobAnalysis: JobAnalysis | null;
};

/** Renders validated data only. No resume analysis or job matching runs here. */
export function ResultsDashboard({ data, mode, jobAnalysis }: ResultsDashboardProps) {
  const groups = groupFindings(data.findings);

  return <div className="min-w-0 space-y-6 text-sm leading-6 [overflow-wrap:anywhere]">
    <p className="text-xs font-medium text-muted-foreground">{mode === "general" ? "General Resume Review" : "Job-Specific Review"}</p>
    <details open className="min-w-0 rounded-xl border bg-muted/20">
      <summary className="min-h-11 cursor-pointer rounded-xl p-4 text-lg font-semibold">Overview</summary>
      <div className="min-w-0 space-y-6 border-t p-4 sm:p-5">
        <section><h4 className="font-semibold">Overall assessment</h4><p className="mt-2">{data.assessment}</p><p className="mt-2 text-xs text-muted-foreground">AI assessment of the submitted preview—not a score or an independent verification.</p></section>
        <section>
          <h4 className="font-semibold">Three priorities</h4>
          <ol className="mt-3 list-decimal space-y-3 pl-5 marker:text-muted-foreground">
            {data.priorities.map((item, index) => <li key={index} className="min-w-0 pl-1">
              <details className="min-w-0 rounded-lg border bg-card">
                <summary className="min-h-11 cursor-pointer rounded-lg p-3 font-medium">{item.title}</summary>
                <div className="min-w-0 space-y-4 border-t p-3"><p>{item.recommendation}</p><Evidence quotes={item.resumeEvidence} /></div>
              </details>
            </li>)}
          </ol>
        </section>
        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <section className="min-w-0">
            <h4 className="font-semibold">Strengths</h4>
            <ul className="mt-3 space-y-3">{data.strengths.map((item, index) => <li key={index} className="min-w-0">
              <details className="min-w-0 rounded-lg border bg-card">
                <summary className="min-h-11 cursor-pointer rounded-lg p-3 font-medium">{item.title}</summary>
                <div className="min-w-0 space-y-4 border-t p-3"><p>{item.explanation}</p><Evidence quotes={item.resumeEvidence} /></div>
              </details>
            </li>)}</ul>
          </section>
          <section className="min-w-0">
            <h4 className="font-semibold">Main opportunities</h4>
            <p className="mt-2 text-xs text-muted-foreground">From the returned findings, in their supplied order. Open the grouped recommendations below for evidence and actions.</p>
            {data.findings.length ? <ul className="mt-3 list-disc space-y-2 pl-5">{data.findings.slice(0, 3).map((finding) => <li key={finding.id}>{finding.issue}</li>)}</ul> : <p className="mt-3 text-muted-foreground">No specific findings returned. This does not mean the resume is complete or error-free.</p>}
          </section>
        </div>
      </div>
    </details>

    <section className="min-w-0 space-y-5">
      <div><h4 className="text-lg font-semibold">Findings and evidence</h4><p className="mt-2 text-muted-foreground">Open a recommendation to inspect the exact original evidence, why it matters, and a suggested action. Impact / severity is an AI judgment.</p></div>
      {groups.map((group) => <section key={group.id} className="min-w-0">
        <h5 className="mb-3 font-semibold">{group.title}</h5>
        {group.findings.length ? <ul className="space-y-3">{group.findings.map((finding) => <li key={finding.id} className="min-w-0"><RecommendationCard finding={finding} /></li>)}</ul> : <p className="rounded-lg bg-muted/40 p-3 text-muted-foreground">No specific findings returned for this group. This is not confirmation that it is complete or error-free; see coverage for assessment limits.</p>}
      </section>)}
    </section>

    {mode === "job-specific" && <JobEvidenceComparison analysis={jobAnalysis} />}

    <details className="min-w-0 rounded-xl border">
      <summary className="min-h-11 cursor-pointer rounded-xl p-4 font-semibold">Coverage areas</summary>
      <div className="space-y-3 border-t p-4">
        <p className="text-muted-foreground">Assessed means the AI returned an assessment for that area, not that every issue was checked or that the area passed. Formatting comments concern extracted text, not the original document’s visual layout.</p>
        <ul className="grid min-w-0 gap-4 sm:grid-cols-2">{data.areas.map((item) => <li key={item.area} className="min-w-0"><p className="font-medium"><span className="capitalize">{item.area}</span> · {item.status === "assessed" ? "Assessed" : "Not assessed"}</p><p className="mt-1 text-muted-foreground">{item.explanation}</p></li>)}</ul>
      </div>
    </details>
    <details className="min-w-0 rounded-xl border">
      <summary className="min-h-11 cursor-pointer rounded-xl p-4 font-semibold">Review limitations</summary>
      <div className="space-y-3 border-t p-4 text-muted-foreground">
        <p>This is a bounded, nonexhaustive AI review of the sent previews. Exact citations are checked against those previews; semantic claims may still be wrong. Missing evidence is not proof of missing ability. Nothing here edits your resume or guarantees an ATS result or hiring outcome.</p>
        <ul className="list-disc space-y-2 pl-5">{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </div>
    </details>
  </div>;
}
