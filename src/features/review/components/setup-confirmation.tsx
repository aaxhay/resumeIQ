import type { RefObject } from "react";
import { Notice } from "@/components/ui/notice";
import type { ReviewMode } from "../review-options";

export function SetupConfirmation({ mode, panelRef }: { mode: ReviewMode; panelRef: RefObject<HTMLDivElement | null> }) {
  return (
    <Notice ref={panelRef} tabIndex={-1} tone="success" role="status" className="mt-5">
      <h3 className="font-semibold">Resume text confirmed</h3>
      <p className="mt-1">Your current edited text and {mode === "general" ? "General Review" : "Job-Specific Review"} preferences are confirmed for this session. Text checks run only when you choose Run text checks below. No AI analysis is performed.</p>
      <p className="mt-2">You can keep editing, or select Start over to clear this session’s input.</p>
    </Notice>
  );
}
