import type { RefObject } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MAX_JOB_CHARACTERS, MIN_JOB_CHARACTERS } from "../validation";
import { cn } from "@/lib/utils";

type JobDescriptionFieldProps = {
  value: string;
  error?: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export function JobDescriptionField({ value, error, inputRef, onChange, onBlur }: JobDescriptionFieldProps) {
  return (
    <section aria-labelledby="job-label">
      <label id="job-label" htmlFor="job-description" className="text-lg font-semibold">3. Add the job description</label>
      <p id="job-help" className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">Paste the role’s responsibilities, requirements, and preferred skills. Include at least {MIN_JOB_CHARACTERS} characters, not just a title or link.</p>
      <Textarea
        ref={inputRef}
        id="job-description"
        name="job-description"
        value={value}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={`job-help job-count${error ? " job-error" : ""}`}
        placeholder={"For example: We’re looking for a product designer to collaborate with engineering, lead user research, and create accessible experiences…"}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs leading-6">
        <p className="text-muted-foreground">Your job description stays in this browser during extraction.</p>
        <p id="job-count" className={cn("tabular-nums", value.length > MAX_JOB_CHARACTERS ? "font-semibold text-destructive" : "text-muted-foreground")}>{value.length.toLocaleString("en-US")} / 10,000 characters</p>
      </div>
      {error && <p id="job-error" role="alert" className="mt-2 text-sm leading-6 text-destructive">{error}</p>}
    </section>
  );
}
