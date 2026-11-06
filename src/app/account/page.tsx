import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { AccountHistory } from "@/features/saved-reviews/account-history";

export const metadata: Metadata = {
  title: "Optional account & saved summaries — ResumeIQ",
  description: "Optional account access and private review summaries. Start reviewing without an account; save only with separate consent.",
  robots: { index: false, follow: false },
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ auth?: string | string[] }> }) {
  const params = await searchParams;
  return <>
    <SiteHeader />
    <main id="main-content" tabIndex={-1} className="page-container py-10 sm:py-14">
      <div className="mb-8 max-w-2xl">
        <p className="eyebrow">Optional · Your private summaries</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A little history. On your terms.</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Your first review never needs an account. Sign in only if you want to save selected AI review summaries—not your resume or editing workspace.</p>
        <Link href="/review" className={`${buttonVariants({ variant: "outline" })} mt-5 whitespace-normal`}>Start a review · no account needed</Link>
      </div>
      <div className="max-w-3xl"><AccountHistory confirmationFailed={params.auth === "failed"} /></div>
    </main>
    <SiteFooter />
  </>;
}
