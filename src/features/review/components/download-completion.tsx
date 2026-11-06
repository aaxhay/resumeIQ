"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EXPORT_FILENAME } from "@/lib/resume-export/contracts";

/** In-page completion screen: the editing subtree stays mounted, never persisted. */
export function DownloadCompletion({ onReturn, onStartOver }: { onReturn: () => void; onStartOver: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { heading.current?.focus(); }, []);
  return <Card>
    <section aria-labelledby="download-complete-title" className="min-w-0 space-y-5" data-testid="download-completion">
      <CheckCircle2 aria-hidden="true" className="size-9 text-primary" />
      <div><p className="eyebrow">Your document is ready</p><h2 ref={heading} tabIndex={-1} id="download-complete-title" className="mt-3 rounded-sm text-2xl font-semibold tracking-tight">Your DOCX download has started</h2></div>
      <p className="text-sm leading-7 text-muted-foreground">Check your browser’s downloads for <strong className="[overflow-wrap:anywhere]">{EXPORT_FILENAME}</strong>. The browser does not tell this page whether you finished saving the file. If it was blocked or cancelled, return to your review and choose Download DOCX again.</p>
      <Notice>Your original, improved preview, accepted edits, and unsaved wording are still available in this tab. They remain memory-only: refreshing or closing the page loses them. Downloading does not automatically save account history.</Notice>
      <div className="flex flex-wrap gap-3">
        <Button type="button" className="max-w-full whitespace-normal" onClick={onReturn}>Return to review</Button>
        <a href="/account" target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "max-w-full whitespace-normal" })}>View account history (new tab)</a>
        <Button type="button" variant="ghost" className="max-w-full whitespace-normal" onClick={() => setConfirmReset(true)}>Start another review</Button>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">To save a summary, return to review, open Save review summary, sign in if needed, and give separate consent. Saved summaries cannot restore your editing draft.</p>
      {confirmReset && <div role="group" aria-label="Confirm another review" className="space-y-3 rounded-lg border p-4">
        <p className="text-sm leading-7">Start a new review and discard this tab’s original snapshot, draft, and local edit history? Check that you have the downloaded file first. Existing account summaries and downloaded files are not deleted.</p>
        <div className="flex flex-wrap gap-3"><Button autoFocus type="button" variant="destructive" className="max-w-full whitespace-normal" onClick={onStartOver}>Discard local draft and start another review</Button><Button type="button" variant="outline" onClick={() => { setConfirmReset(false); heading.current?.focus(); }}>Keep this review</Button></div>
      </div>}
    </section>
  </Card>;
}
