import { ReviewExitLink } from "@/components/review-exit-link";
import { ArrowRight, Check, FileText, MoveUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="hero-shell page-container grid items-center gap-10 pt-14 pb-16 sm:gap-14 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:gap-14 lg:py-24" aria-labelledby="hero-title">
      <div className="hero-copy min-w-0">
        <p className="eyebrow mb-5">A little clarity. A stronger next chapter.</p>
        <h1 id="hero-title" className="hero-title max-w-2xl text-[2.625rem] leading-[1.08] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[4rem]">
          Make your next move with a <span className="hero-title-accent">stronger resume.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          Your experience deserves to come through clearly. Set up a general
          review, or focus on a specific job. Start with local text checks, then choose optional Gemini feedback when configured.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <ReviewExitLink href="/review" className={buttonVariants({ size: "lg", className: "hero-cta" })}>Review My Resume <ArrowRight aria-hidden="true" /></ReviewExitLink>
          <a href="#how-it-works" className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold underline-offset-4 transition-colors hover:text-primary hover:underline">See how it works</a>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">PDF, DOCX, or pasted text · No account needed</p>
      </div>
      <div className="hero-stage min-w-0">
        <div aria-hidden="true" className="hero-sheet hero-sheet-back" />
        <div aria-hidden="true" className="hero-sheet" />
        <div aria-hidden="true" className="hero-orb" />
      <aside className="hero-panel min-w-0 rounded-3xl border border-primary/20 p-6 sm:p-8 lg:p-9" aria-labelledby="approach-title">
        <div className="mb-7 flex flex-wrap items-center gap-4">
          <span className="rounded-xl border border-primary/10 bg-card p-3 text-primary shadow-xs"><FileText aria-hidden="true" className="size-6" /></span>
          <span className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">The ResumeIQ approach</span>
        </div>
        <h2 id="approach-title" className="text-3xl leading-tight font-semibold tracking-[-0.035em]">Less second-guessing.<br />More direction.</h2>
        <ul className="my-7 space-y-5 text-sm leading-6">
          {[
            ["Start with your story", "Bring the experience you already have."],
            ["Choose your focus", "A stronger foundation or a specific opportunity."],
            ["Stay in control", "Inspect, edit, and confirm your extracted text."],
          ].map(([title, description]) => (
            <li key={title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-card text-primary"><Check aria-hidden="true" className="size-3.5" /></span>
              <div><p className="font-semibold">{title}</p><p className="mt-0.5 text-muted-foreground">{description}</p></div>
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-3 border-t border-primary/15 pt-5 text-xs leading-6 text-muted-foreground">
          <MoveUpRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
          <p>Upload, confirm your text, and run explainable checks without scores. Gemini feedback is optional, requires consent, and is synthetic-only by default. Download your approved improved draft as DOCX.</p>
        </div>
      </aside>
      </div>
    </section>
  );
}
