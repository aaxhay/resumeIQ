import Link from "next/link";
import { ReviewExitLink } from "@/components/review-exit-link";

export function SiteFooter({ reviewPage = false }: { reviewPage?: boolean }) {
  const NavigationLink = reviewPage ? ReviewExitLink : Link;
  return (
    <footer className="border-t bg-card">
      <div className="page-container flex flex-col gap-3 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p><span className="font-semibold text-foreground">ResumeIQ</span> · Your experience, better expressed.</p>
        <NavigationLink href="/#privacy" className="inline-flex min-h-11 w-fit items-center rounded-sm underline-offset-4 transition-colors hover:text-primary hover:underline">How this preview handles your data</NavigationLink>
      </div>
    </footer>
  );
}
