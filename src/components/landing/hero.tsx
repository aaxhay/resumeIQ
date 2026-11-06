import Link from "next/link";
import { ArrowRight, Check, FileText, MoveUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="page-container grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.25fr_1fr] lg:gap-16" aria-labelledby="hero-title">
      <div>
        <p className="eyebrow mb-6">A little clarity. A stronger next chapter.</p>
        <h1 id="hero-title" className="max-w-2xl text-4xl leading-[1.1] font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
          Make your next move with a <span className="text-primary">stronger resume.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          Your experience deserves to come through clearly. Set up a general
          review, or focus on a specific job. Start with local text checks, then choose optional Gemini feedback when configured.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link href="/review" className={buttonVariants({ size: "lg" })}>Review My Resume <ArrowRight aria-hidden="true" /></Link>
          <a href="#how-it-works" className="rounded-sm text-sm font-medium underline-offset-4 hover:text-primary hover:underline">See how it works</a>
        </div>
        <p className="mt-5 text-xs leading-6 text-muted-foreground">PDF, DOCX, or pasted text · No account needed</p>
      </div>
      <aside className="relative rounded-3xl border border-primary/15 bg-[#edf3ed] p-6 sm:p-9" aria-labelledby="approach-title">
        <div className="mb-8 flex items-center justify-between">
          <span className="rounded-xl bg-card p-3 text-primary shadow-xs"><FileText aria-hidden="true" className="size-6" /></span>
          <span className="text-xs font-medium tracking-wider text-primary uppercase">The ResumeIQ approach</span>
        </div>
        <h2 id="approach-title" className="max-w-xs text-2xl leading-snug font-semibold tracking-tight">Less second-guessing.<br />More direction.</h2>
        <ul className="my-7 space-y-5 text-sm leading-6">
          {[
            ["Start with your story", "Bring the experience you already have."],
            ["Choose your focus", "A stronger foundation or a specific opportunity."],
            ["Stay in control", "Inspect, edit, and confirm your extracted text."],
          ].map(([title, description]) => (
            <li key={title} className="flex gap-3">
              <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
              <div><p className="font-semibold">{title}</p><p className="text-muted-foreground">{description}</p></div>
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-3 border-t border-primary/15 pt-5 text-xs leading-6 text-muted-foreground">
          <MoveUpRight aria-hidden="true" className="mt-1 size-4 shrink-0" />
          <p>Upload, confirm your text, and run explainable checks without scores. Gemini feedback is optional, requires consent, and is synthetic-only by default. Export is not available yet.</p>
        </div>
      </aside>
    </section>
  );
}
