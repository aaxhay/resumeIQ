import type { ReactNode } from "react";

/** Full same-tab navigation lets the workspace's beforeunload warning run.
 * Next's client-side navigation otherwise bypasses it and silently loses local edits.
 * Also use on entry into /review: its previous history entry must belong to a
 * different document so browser Back invokes beforeunload too.
 * Native links work before hydration; modified/new-tab clicks leave the draft mounted.
 */
export function ReviewExitLink({ href, children, ...props }: {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return <a href={href} {...props}>{children}</a>;
}
