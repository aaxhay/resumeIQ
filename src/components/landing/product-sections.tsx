import { FileCheck2, Focus, LockKeyhole, PencilLine, ScanText, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { REVIEW_OPTIONS } from "@/features/review/review-options";

export function ReviewModesOverview() {
  return (
    <section className="page-container border-t py-16 sm:py-20" aria-labelledby="modes-title">
      <p className="eyebrow mb-3">Your resume. Your focus.</p>
      <h2 id="modes-title" className="section-title">Two ways to move forward.</h2>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Not every next step looks the same. Choose the review that fits yours.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {REVIEW_OPTIONS.map((option, index) => {
          const Icon = index === 0 ? FileCheck2 : Focus;
          return (
            <Card key={option.value} className="feature-card flex flex-col">
              <span className="mb-5 flex size-12 items-center justify-center rounded-xl border border-primary/10 bg-accent/60 text-primary"><Icon aria-hidden="true" className="size-6" /></span>
              <h3 className="text-xl font-semibold tracking-tight">{option.title}</h3>
              <p className="mt-3 leading-7 text-muted-foreground">{option.description}</p>
              <p className="mt-auto pt-5 text-sm font-medium text-primary">{option.detail}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y bg-card py-16 sm:py-20" aria-labelledby="how-title">
      <div className="page-container">
        <p className="eyebrow mb-3">Simple by design</p>
        <h2 id="how-title" className="section-title">A clear path from draft to ready.</h2>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Start with extraction and local text checks. Optional Gemini feedback requires configuration and consent. Download your approved improved draft as DOCX.</p>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            { title: "Add your resume", description: "Upload a PDF or DOCX, or paste your text. Choose a review mode, then inspect, edit, and confirm the extracted text.", stage: "Available now", Icon: FileCheck2 },
            { title: "Find your opportunities", description: "Run local text checks, or review minimized previews and explicitly consent to Gemini feedback. Synthetic-only by default.", stage: "Gemini when configured", Icon: ScanText },
            { title: "Make it your own", description: "Accept, reject, or edit recommendations in a separate draft. Undo edits or restore the original, then download your approved draft as an editable DOCX.", stage: "Controlled editing available", Icon: PencilLine },
          ].map(({ title, description, stage, Icon }, index) => (
            <li key={title} className="min-w-0 border-t pt-6">
              <div className="mb-5 flex flex-wrap items-center gap-3 text-primary"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/60"><Icon aria-hidden="true" className="size-5" /></span><span className="text-xs leading-5 font-medium">0{index + 1} / {stage}</span></div>
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
      <div className="grid gap-8 rounded-3xl bg-[#173e35] p-6 text-white sm:p-10 md:grid-cols-[1.1fr_1fr] md:gap-12 lg:p-12">
        <div><ShieldCheck aria-hidden="true" className="mb-5 size-7 text-emerald-200" /><h2 id="privacy-title" className="text-3xl leading-tight font-semibold tracking-tight">Clear about your privacy.</h2><p className="mt-4 leading-7 text-emerald-50/90">Extraction sends your file or pasted text to this application’s server for in-memory processing. The application does not save it to a database or file storage, and extraction does not send content to an AI provider.</p></div>
        <div className="space-y-5 text-sm leading-7 text-emerald-50/90">
          <p className="flex gap-3"><LockKeyhole aria-hidden="true" className="mt-1 size-5 shrink-0" /><span>Draft edits remain in this page’s memory, not an account or browser storage. Explicit Gemini review sends reviewed previews to Google; DOCX export instead sends only the improved resume to this application’s server for in-memory generation. The application does not log resume text. Start over or reload clears the page, not files you have downloaded.</span></p>
          <p>Optional account history saves only the summary and limited excerpts you preview and explicitly consent to—not your files or editing workspace. Summaries expire after 30 days and can be deleted earlier from Account. Reloading does not delete saved summaries.</p>
          <p className="border-t border-white/20 pt-5">Optional Gemini review sends only the previews you review to Google after explicit consent. Best-effort redaction is not anonymity. Synthetic-only is the default because unpaid-service terms prohibit personal or confidential documents.</p>
        </div>
      </div>
    </section>
  );
}
