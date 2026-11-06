import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, ScanText } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Notice } from "@/components/ui/notice";
import { ReviewSetupForm } from "@/features/review/components/review-setup-form";

export const metadata: Metadata = {
  title: "Set up your review — ResumeIQ",
  description: "Upload a PDF or DOCX, or paste your resume. Inspect, edit, and confirm the text before local text checks or optional, consent-based Gemini review.",
};

export default function ReviewPage() {
  return (
    <>
      <SiteHeader reviewPage />
      <main id="main-content" tabIndex={-1} className="page-container py-10 sm:py-14">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" className="size-4" /> Back to overview</Link>
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow mb-3">Let’s start with your story</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Set up your resume review.</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">Add your resume, choose your focus, and make sure your text looks right. No account, no pressure—just a clear place to start.</p>
        </div>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <Notice className="mb-5"><strong className="text-foreground">Text extraction is ready.</strong> Upload or paste, confirm your edits, then run explainable text checks. Optional Gemini review requires configuration, preview review, and explicit consent. Synthetic-only by default; export is not available yet.</Notice>
            <noscript><Notice tone="error" className="mb-5">Enable JavaScript to upload a file or paste text. Nothing has been uploaded.</Notice></noscript>
            <ReviewSetupForm />
          </div>
          <aside aria-label="Review guidance" className="space-y-7 lg:pt-2">
            <section className="rounded-2xl border bg-accent/50 p-6">
              <LockKeyhole aria-hidden="true" className="mb-4 size-5 text-primary" />
              <h2 className="font-semibold">Your text. In your control.</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Files and pasted text go to this application’s server only when you request extraction. They are processed in memory, without application file storage or AI requests.</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Edits and job descriptions stay in this page’s memory unless you explicitly send reviewed previews to Google for Gemini processing. Use Start over or reload to clear the page; this cannot undo a provider transfer.</p>
              <Link href="/#privacy" className="mt-4 inline-block rounded-sm text-sm font-medium text-primary underline underline-offset-4">About your privacy</Link>
            </section>
            <section className="px-1">
              <ScanText aria-hidden="true" className="mb-3 size-5 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Check before you confirm</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">Compare headings, dates, bullets, and section order with your original. Complex columns or tables may need correction. Extraction warnings are not resume scores.</p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">Use a text-based PDF (up to 20 pages) or DOCX, up to 5 MB. OCR is not available. For scanned, protected, or damaged files, paste your text instead.</p>
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
