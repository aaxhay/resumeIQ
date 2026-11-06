"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Full same-tab navigation lets the workspace's beforeunload warning run.
 * Next's client-side navigation otherwise bypasses it and silently loses local edits.
 * Modified/new-tab clicks retain normal Link behavior and leave the draft mounted.
 */
export function ReviewExitLink({ href, children, ...props }: {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return <Link href={href} {...props} onNavigate={event => {
    event.preventDefault();
    window.location.assign(href);
  }}>{children}</Link>;
}
