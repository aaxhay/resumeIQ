import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Notice({
  tone = "info",
  className,
  ...props
}: ComponentProps<"div"> & { tone?: "info" | "success" | "error" }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 text-sm leading-6",
        tone === "info" && "bg-muted/60 text-muted-foreground",
        tone === "success" && "border-primary/25 bg-accent text-primary",
        tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        className,
      )}
      {...props}
    />
  );
}
