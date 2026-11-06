import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="page-container flex flex-col gap-3 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p><span className="font-semibold text-foreground">ResumeIQ</span> · Your experience, better expressed.</p>
        <Link href="/#privacy" className="w-fit rounded-sm underline-offset-4 hover:text-primary hover:underline">How this preview handles your data</Link>
      </div>
    </footer>
  );
}
