import { FileCheck2, Focus, LockKeyhole, PencilLine, ScanText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { REVIEW_OPTIONS } from "@/features/review/review-options";

export function ReviewModesOverview() {
  return (
    <section className="page-container py-16" aria-labelledby="modes-title">
      <p className="eyebrow mb-3">Your resume. Your focus.</p>
      <h2 id="modes-title" className="section-title">Two ways to move forward.</h2>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Not every next step looks the same. Choose the review that fits yours.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {REVIEW_OPTIONS.map((option, index) => {
          const Icon = index === 0 ? FileCheck2 : Focus;
          return (
            <Card key={option.value}>
              <Icon aria-hidden="true" className="mb-5 size-6 text-primary" />
              <h3 className="text-xl font-semibold tracking-tight">{option.title}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{option.description}</p>
              <p className="mt-5 text-xs font-semibold text-primary">{option.detail}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y bg-card py-16" aria-labelledby="how-title">
      <div className="page-container">
        <p className="eyebrow mb-3">Simple by design</p>
        <h2 id="how-title" className="section-title">A clear path from draft to ready.</h2>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Start with extraction and local text checks. Optional Gemini feedback requires configuration and consent; export is planned.</p>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            { title: "Add your resume", description: "Upload a PDF or DOCX, or paste your text. Choose a review mode, then inspect, edit, and confirm the extracted text.", stage: "Available now", Icon: FileCheck2 },
            { title: "Find your opportunities", description: "Run local text checks, or review minimized previews and explicitly consent to Gemini feedback. Synthetic-only by default.", stage: "Gemini when configured", Icon: ScanText },
            { title: "Make it your own", description: "Accept, reject, or edit recommendations in a separate draft. Undo edits or restore the original. DOCX export is still planned.", stage: "Controlled editing available", Icon: PencilLine },
          ].map(({ title, description, stage, Icon }, index) => (
            <li key={title} className="border-t pt-5">
              <div className="mb-5 flex items-center justify-between text-primary"><Icon aria-hidden="true" className="size-5" /><span className="text-xs font-medium">0{index + 1} / {stage}</span></div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function PrivacySection() {
  return (
    <section id="privacy" className="page-container py-16 sm:py-20" aria-labelledby="privacy-title">
      <div className="grid gap-8 rounded-2xl bg-[#173e35] p-7 text-white sm:p-10 md:grid-cols-[1.2fr_1fr] md:gap-16">
        <div><ShieldCheck aria-hidden="true" className="mb-5 size-7 text-emerald-200" /><h2 id="privacy-title" className="text-3xl leading-tight font-semibold tracking-tight">Clear about your privacy.</h2><p className="mt-4 leading-7 text-emerald-50/90">Extraction sends your file or pasted text to this application’s server for in-memory processing. The application does not save it to a database or file storage, and extraction does not send content to an AI provider.</p></div>
        <div className="space-y-5 text-sm leading-7 text-emerald-50/90">
          <p className="flex gap-3"><LockKeyhole aria-hidden="true" className="mt-1 size-5 shrink-0" /><span>Your edits and job description stay in this page’s memory unless you explicitly send reviewed previews for Gemini processing—not in an account or browser storage. Use Start over or reload to clear the page. The application does not log resume text.</span></p>
          <p className="border-t border-white/20 pt-5">Optional Gemini review sends only the previews you review to Google after explicit consent. Best-effort redaction is not anonymity. Synthetic-only is the default because unpaid-service terms prohibit personal or confidential documents.</p>
        </div>
      </div>
    </section>
  );
}
