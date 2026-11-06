import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("min-w-0 rounded-2xl border bg-card p-5 shadow-[0_2px_8px_-4px_rgb(25_47_51_/_0.12)] sm:p-8", className)}
      {...props}
    />
  );
}
