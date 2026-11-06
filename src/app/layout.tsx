import type { Metadata } from "next";
import "./globals.css";
import { COLOR_THEME_INIT } from "@/lib/color-theme";

export const metadata: Metadata = {
  title: "ResumeIQ — Resume review, thoughtfully built",
  description:
    "ResumeIQ is building a clearer way to improve your resume, with general and job-specific AI feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: COLOR_THEME_INIT }} /></head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
