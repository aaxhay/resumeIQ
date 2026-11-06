import type { AiReview } from "@/lib/ai-review/contracts";
import { Evidence } from "./evidence";

export function RecommendationCard({ finding }: { finding: AiReview["findings"][number] }) {
  return <details className="min-w-0 rounded-xl border bg-card">
    <summary className="min-h-11 cursor-pointer rounded-xl p-4 marker:text-muted-foreground">
      <span className="ml-1 font-medium">{finding.issue}</span>
      <span className="mt-2 block text-xs text-muted-foreground"><span className="capitalize">{finding.area}</span> · <span className="capitalize">{finding.impact}</span> impact / severity · AI judgment</span>
    </summary>
    <div className="min-w-0 space-y-4 border-t p-4">
      <Evidence quotes={finding.resumeEvidence} />
      <div><h6 className="font-medium">Why it matters</h6><p className="mt-1">{finding.whyItMatters}</p></div>
      <div><h6 className="font-medium">Recommended action</h6><p className="mt-1">{finding.recommendation}</p></div>
      {finding.suggestedRewrite && <div className="min-w-0 space-y-3 rounded-lg bg-muted/50 p-3">
        <h6 className="font-medium">Optional extractive rewrite · not applied</h6>
        <p className="text-muted-foreground">Verify the meaning and facts before using it. Nothing is changed in your resume.</p>
        <Evidence quotes={[finding.suggestedRewrite.original]} source="Original resume preview" />
        <div><p className="font-medium">Suggested wording</p><blockquote className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{finding.suggestedRewrite.revised}</blockquote></div>
      </div>}
    </div>
  </details>;
}
