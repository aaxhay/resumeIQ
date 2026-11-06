import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ReviewExitLink } from "@/components/review-exit-link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader({ reviewPage = false }: { reviewPage?: boolean }) {
  const NavigationLink = reviewPage ? ReviewExitLink : Link;
  return (
    <>
      <a href="#main-content" className="sr-only fixed top-4 left-4 z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only">
        Skip to content
      </a>
      <header className="site-header border-b bg-card/90">
        <div className="page-container flex min-h-20 flex-wrap items-center justify-between gap-4 py-4">
          <NavigationLink href="/" aria-label="ResumeIQ home" className="flex items-center gap-2.5 rounded-md text-xl font-semibold tracking-tight">
            <span className="rounded-xl bg-primary p-2.5 text-primary-foreground"><FileText aria-hidden="true" className="size-5" /></span>
            Resume<span className="-ml-2 text-primary">IQ</span>
          </NavigationLink>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium sm:gap-x-6">
            <ThemeToggle />
            <NavigationLink href="/#how-it-works" className="hidden min-h-11 items-center rounded-sm text-muted-foreground transition-colors hover:text-primary sm:inline-flex">How it works</NavigationLink>
            <NavigationLink href="/#privacy" className="hidden min-h-11 items-center rounded-sm text-muted-foreground transition-colors hover:text-primary sm:inline-flex">Privacy</NavigationLink>
            <a href="/account" target={reviewPage ? "_blank" : undefined} rel={reviewPage ? "noopener noreferrer" : undefined} className="inline-flex min-h-11 items-center gap-1 rounded-sm text-muted-foreground hover:text-primary" title={reviewPage ? "Opens in a new tab to keep your review here" : undefined} aria-label={reviewPage ? "Account (opens in a new tab; keeps your review here)" : "Account"}>Account{reviewPage && <ArrowUpRight aria-hidden="true" className="size-3.5" />}</a>
            {reviewPage ? (
              <span className="rounded-full border bg-muted px-3 py-1.5 text-xs text-muted-foreground">Text confirmation</span>
            ) : (
              <ReviewExitLink href="/review" className={buttonVariants({ variant: "outline" })}>Get started <ArrowUpRight aria-hidden="true" /></ReviewExitLink>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
