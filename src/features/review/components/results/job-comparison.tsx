"use client";

import { useId, useState } from "react";
import type { JobAnalysis, JobComparison } from "@/lib/job-description/analysis-contracts";
import { COMPARISON_FILTERS, COMPARISON_STATUS_LABELS, groupComparisons, JOB_CATEGORY_LABELS, type ComparisonFilter } from "../../results-model";
import { Evidence } from "./evidence";

function ComparisonCard({ comparison }: { comparison: JobComparison }) {
  return <details className="min-w-0 rounded-xl border bg-card">
    <summary className="min-h-11 cursor-pointer rounded-xl p-4 marker:text-muted-foreground">
      <span className="ml-1 font-medium">{comparison.requirement}</span>
      <span className="mt-2 block text-xs text-muted-foreground">{COMPARISON_STATUS_LABELS[comparison.status]} · {comparison.source === "validated-ai" ? "AI judgment" : "Unassessed extraction"}</span>
    </summary>
    <div className="min-w-0 space-y-4 border-t p-4">
      <p>{comparison.explanation}</p>
      <Evidence quotes={[comparison.jobEvidence]} source="Job description preview" />
      <Evidence quotes={comparison.resumeEvidence} />
      <div><p className="font-medium">Recommended action</p><p className="mt-1">{comparison.recommendation}</p></div>
      <p className="text-xs text-muted-foreground">Source: {comparison.source === "validated-ai" ? "Validated AI comparison. Exact citations were checked; the interpretation is still an AI judgment." : "Conservative explicit-field extraction. This requirement was not assessed by the AI comparison; no match status has been inferred."}</p>
    </div>
  </details>;
}

function RequirementCoverage({ comparisons }: { comparisons: JobComparison[] }) {
  const groups = groupComparisons(comparisons).filter((group) => group.category === "required_skill" || group.category === "preferred_skill");
  return <details className="rounded-xl border">
    <summary className="min-h-11 cursor-pointer rounded-xl p-4 font-medium">Required and preferred coverage</summary>
    <div className="space-y-4 border-t p-4">
      <p className="text-muted-foreground">Lists reflect the supplied categories and comparison statuses, not a complete inventory of the job or a percentage match. Other requirements appear under their own categories below.</p>
      {groups.map((group) => <section key={group.category}>
        <h5 className="font-semibold">{group.title}</h5>
        {group.comparisons.length ? <ul className="mt-2 space-y-2">{group.comparisons.map((item) => <li key={item.id} className="min-w-0"><span>{item.requirement}</span><span className="block text-xs text-muted-foreground">{COMPARISON_STATUS_LABELS[item.status]} · {item.source === "validated-ai" ? "AI judgment" : "Unassessed extraction"}</span></li>)}</ul> : <p className="mt-2 text-muted-foreground">No requirements in this category were returned. This does not establish that the job has none.</p>}
      </section>)}
    </div>
  </details>;
}

export function JobEvidenceComparison({ analysis }: { analysis: JobAnalysis | null }) {
  const id = useId();
  const [filter, setFilter] = useState<ComparisonFilter>("all");
  const groups = groupComparisons(analysis?.comparisons ?? [], filter).filter((group) => group.comparisons.length > 0);

  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-4 border-t pt-6">
    <div>
      <p className="text-xs font-medium text-muted-foreground">Job-specific relevance</p>
      <h4 id={`${id}-title`} className="mt-1 text-lg font-semibold">Job evidence comparison</h4>
      <p className="mt-2 text-muted-foreground">“Not evidenced” means the supplied resume preview does not demonstrate a requirement—not that you lack the skill. These are AI judgments or explicitly unassessed requirements, not hiring decisions.</p>
    </div>
    {!analysis ? <p>No job analysis was supplied; no fit conclusion can be drawn.</p> : <>
      <dl className="grid min-w-0 gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Job title</dt><dd className="mt-1 font-medium">{analysis.profile.title?.value ?? "Unknown — not explicitly identified"}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Company</dt><dd className="mt-1 font-medium">{analysis.profile.company?.value ?? "Unknown — not explicitly identified"}</dd></div>
      </dl>
      <details className="rounded-xl border">
        <summary className="min-h-11 cursor-pointer rounded-xl p-4 font-medium">Exact job description field evidence</summary>
        <div className="min-w-0 space-y-5 border-t p-4">
          <p className="text-muted-foreground">These fields come from conservative extraction of explicit headings and wording, not inferred facts. Evidence is from the submitted job description preview.</p>
          {(["title", "company"] as const).map((field) => {
            const value = analysis.profile[field];
            return <div key={field}><h5 className="mb-2 font-semibold capitalize">{field}</h5>{value ? <Evidence quotes={[value.evidence.text]} source="Job description preview" /> : <p className="text-muted-foreground">Unknown. No explicit field evidence was identified.</p>}</div>;
          })}
          {analysis.profile.requirements.length ? <ul className="space-y-4">{analysis.profile.requirements.map((item) => <li key={item.id} className="min-w-0 space-y-2">
            <p className="font-medium">{item.requirement}</p>
            <p className="text-xs text-muted-foreground">{JOB_CATEGORY_LABELS[item.category]} · {item.source === "explicit-heading" ? "Explicit heading" : "Explicit wording"}</p>
            <Evidence quotes={[item.evidence.text]} source="Job description preview" />
          </li>)}</ul> : <p className="text-muted-foreground">No explicit requirement fields were extracted. AI comparisons, if supplied, remain separately attributed below.</p>}
        </div>
      </details>
      <RequirementCoverage comparisons={analysis.comparisons} />
      <div className="min-w-0">
        <label htmlFor={`${id}-filter`} className="font-medium">Filter comparison status</label>
        <select id={`${id}-filter`} value={filter} onChange={(event) => {
          const selected = COMPARISON_FILTERS.find((value) => value === event.target.value);
          if (selected) setFilter(selected);
        }} aria-describedby={`${id}-filter-help`} className="field-control mt-2 min-w-0 sm:max-w-xs">
          {COMPARISON_FILTERS.map((value) => <option key={value} value={value}>{value === "all" ? "All statuses" : COMPARISON_STATUS_LABELS[value]}</option>)}
        </select>
        <p id={`${id}-filter-help`} className="mt-2 text-xs text-muted-foreground">Open a requirement to read its explanation, exact job evidence, resume evidence, and recommended action. Filtering does not change any assessment or the coverage lists.</p>
      </div>
      {!groups.length && <p role="status" className="rounded-xl bg-muted/50 p-4">{analysis.comparisons.length ? "No comparisons have this status. Choose another status or All statuses." : "No job comparisons returned; no fit conclusion can be drawn."}</p>}
      <div className="space-y-5">
        {groups.map((group) => <section key={group.category} className="min-w-0">
          <h5 className="mb-3 font-semibold">{group.title}</h5>
          <ul className="space-y-3">{group.comparisons.map((comparison) => <li key={comparison.id} className="min-w-0"><ComparisonCard comparison={comparison} /></li>)}</ul>
        </section>)}
      </div>
      <details className="rounded-xl border">
        <summary className="min-h-11 cursor-pointer rounded-xl p-4 font-medium">Job comparison methodology and limitations</summary>
        <div className="space-y-3 border-t p-4 text-muted-foreground">
          <p>AI comparisons are bounded and nonexhaustive. Validation checks structure and exact citations, not whether the AI interpretation is correct. Supported and partially supported remain AI judgments about these previews only.</p>
          <p>Conservative extraction recognizes explicit job fields and requirements; it can miss ambiguous or implicit wording. Extracted requirements not covered by a validated AI comparison remain Not assessed. Extraction does not promote them to Supported, Partially supported, or Not evidenced.</p>
          {analysis.profile.truncated && <p>The extraction limit was reached. The extracted profile is incomplete.</p>}
          <ul className="list-disc space-y-2 pl-5">{analysis.profile.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
        </div>
      </details>
    </>}
  </section>;
}
