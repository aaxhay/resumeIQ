import type { SaveReviewRequest } from "@/lib/saved-reviews/contracts";

export function SummaryPreview({ analysis, suggestions }: { analysis: SaveReviewRequest["analysis_result"]; suggestions: SaveReviewRequest["suggestions"] }) {
  return <div className="min-w-0 space-y-5 text-sm leading-7 [overflow-wrap:anywhere]">
    <section><h4 className="font-semibold">Assessment</h4><p className="mt-2 whitespace-pre-wrap">{analysis.assessment}</p></section>
    <section><h4 className="font-semibold">Three priorities</h4><ol className="mt-2 list-decimal space-y-3 pl-5">{analysis.priorities.map((priority, index) => <li key={index}><strong>{priority.title}</strong><p className="whitespace-pre-wrap">{priority.recommendation}</p></li>)}</ol></section>
    <section><h4 className="font-semibold">Strengths</h4><ul className="mt-2 list-disc space-y-3 pl-5">{analysis.strengths.map((strength, index) => <li key={index}><strong>{strength.title}</strong><p className="whitespace-pre-wrap">{strength.explanation}</p></li>)}</ul></section>
    <section><h4 className="font-semibold">Limitations</h4><ul className="mt-2 list-disc space-y-2 pl-5">{analysis.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></section>
    <section><h4 className="font-semibold">AI rewrite excerpts · not applied</h4>{suggestions.length ? <ul className="mt-3 space-y-4">{suggestions.map(suggestion => <li key={suggestion.finding_id} className="space-y-2 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">Suggestion: {suggestion.finding_id} · {suggestion.status.replaceAll("_", " ")}</p>
      <p className="font-medium">Original excerpt</p><p className="whitespace-pre-wrap">{suggestion.original_text}</p>
      <p className="font-medium">Suggested excerpt</p><p className="whitespace-pre-wrap">{suggestion.suggested_text}</p>
    </li>)}</ul> : <p className="mt-2 text-muted-foreground">No eligible rewrite excerpts are included.</p>}</section>
  </div>;
}
