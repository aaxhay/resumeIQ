import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn("field-control min-h-48 resize-y leading-7", className)} {...props} />;
}
