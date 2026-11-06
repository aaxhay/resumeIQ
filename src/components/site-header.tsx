import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader({ reviewPage = false }: { reviewPage?: boolean }) {
  return (
    <>
      <a href="#main-content" className="sr-only fixed top-4 left-4 z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only">
        Skip to content
      </a>
      <header className="border-b bg-card/80">
        <div className="page-container flex min-h-20 flex-wrap items-center justify-between gap-4 py-4">
          <Link href="/" aria-label="ResumeIQ home" className="flex items-center gap-2.5 rounded-md text-xl font-semibold tracking-tight">
            <span className="rounded-xl bg-primary p-2.5 text-primary-foreground"><FileText aria-hidden="true" className="size-5" /></span>
            Resume<span className="-ml-2 text-primary">IQ</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm font-medium sm:gap-8">
            <Link href="/#how-it-works" className="hidden rounded-sm text-muted-foreground hover:text-primary sm:inline">How it works</Link>
            <Link href="/#privacy" className="hidden rounded-sm text-muted-foreground hover:text-primary sm:inline">Privacy</Link>
            {reviewPage ? (
              <span className="rounded-full border bg-muted px-3 py-1.5 text-xs text-muted-foreground">Text confirmation</span>
            ) : (
              <Link href="/review" className={buttonVariants({ variant: "outline" })}>Get started <ArrowUpRight aria-hidden="true" /></Link>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
