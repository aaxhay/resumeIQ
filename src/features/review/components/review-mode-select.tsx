import { Check, FileCheck2, Focus } from "lucide-react";
import { REVIEW_OPTIONS, type ReviewMode } from "../review-options";

export function ReviewModeSelect({ value, onChange }: { value: ReviewMode; onChange: (mode: ReviewMode) => void }) {
  return (
    <fieldset>
      <legend className="text-lg font-semibold">2. Choose your review focus</legend>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Start broad, or bring a specific opportunity into focus.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {REVIEW_OPTIONS.map((option, index) => {
          const Icon = index === 0 ? FileCheck2 : Focus;
          return (
            <label key={option.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="review-mode"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                aria-labelledby={`mode-${option.value}-title`}
                aria-describedby={`mode-${option.value}-description`}
                className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              />
              <span className="flex h-full min-w-0 flex-col rounded-xl border bg-card p-5 transition-colors peer-hover:border-primary/60 peer-checked:border-primary peer-checked:bg-accent/50 peer-checked:shadow-[inset_0_0_0_1px_var(--primary)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring">
                <span className="mb-4 flex items-center justify-between text-primary"><Icon aria-hidden="true" className="size-5" /><span className="flex size-5 items-center justify-center rounded-full border border-primary/40">{value === option.value && <Check aria-hidden="true" className="size-3.5" />}</span></span>
                <span id={`mode-${option.value}-title`} className="font-semibold">{option.title}</span>
                <span id={`mode-${option.value}-description`} className="mt-2 text-sm leading-6 text-muted-foreground">{option.description}</span>
                <span className="mt-auto pt-4 text-xs font-medium text-primary">{option.detail}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
