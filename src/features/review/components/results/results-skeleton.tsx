export function ResultsSkeleton() {
  return <div role="status" aria-atomic="true" className="min-w-0 space-y-4 rounded-xl border p-4 sm:p-5">
    <div><p className="font-medium">Preparing your review</p><p className="mt-1 text-sm text-muted-foreground">Waiting for the validated response. No results are available yet.</p></div>
    <div aria-hidden="true" className="space-y-4">
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-4/5 rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2"><div className="h-20 rounded-lg border bg-muted/40" /><div className="h-20 rounded-lg border bg-muted/40" /></div>
    </div>
  </div>;
}
