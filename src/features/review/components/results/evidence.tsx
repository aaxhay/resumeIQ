export function Evidence({ quotes, source = "Resume preview" }: { quotes: readonly string[]; source?: string }) {
  return <div className="min-w-0 space-y-2">
    <p className="font-medium">{source} evidence · exact text</p>
    {quotes.length ? quotes.map((quote, index) => <blockquote key={index} className="min-w-0 border-l-2 border-input pl-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{quote}</blockquote>) : <p className="text-muted-foreground">No specific resume-preview citation supplied. This is not evidence that a skill or experience is absent.</p>}
  </div>;
}
