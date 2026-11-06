import { processResume } from "./process-resume.ts";
import { safeFailure } from "./errors.ts";
import type { ProcessingInput } from "./types.ts";

// This entry point only receives validated, bounded inputs over parent-owned IPC.
process.once("message", async (input: ProcessingInput) => {
  let result;
  try {
    result = { ok: true as const, data: await processResume(input) };
  } catch (error: unknown) {
    result = safeFailure(error);
  }
  process.send?.(result, () => process.exit(0));
});
