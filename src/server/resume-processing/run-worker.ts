import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { extractionResponseSchema, type ExtractionResponse } from "../../lib/resume/contracts.ts";
import { PARSE_TIMEOUT_MS } from "../../lib/resume/limits.ts";
import { ResumeProcessingError, safeFailure } from "./errors.ts";
import type { ProcessingInput } from "./types.ts";

let active = 0;
const MAX_ACTIVE = 2;

export async function runWorker(input: ProcessingInput, signal?: AbortSignal): Promise<ExtractionResponse> {
  if (signal?.aborted) return safeFailure(new ResumeProcessingError("CANCELLED", "Processing was cancelled."));
  if (active >= MAX_ACTIVE) return safeFailure(new ResumeProcessingError("BUSY", "The document processor is busy. Please try again shortly."));
  active += 1;
  try {
    return await new Promise<ExtractionResponse>((resolve) => {
      const child = spawn(process.execPath, [
        "--conditions=react-server", "--max-old-space-size=192", "--disable-warning=ExperimentalWarning",
        path.join(process.cwd(), "src/server/resume-processing/worker.ts"),
      ], {
        serialization: "advanced",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        // Do not inherit provider credentials or NODE_OPTIONS into the parser.
        env: { NODE_ENV: "production", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP },
        windowsHide: true,
      });
      let response: ExtractionResponse | undefined;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        resolve(response ?? safeFailure(undefined));
      };
      const stop = (code: "TIMEOUT" | "CANCELLED", message: string) => {
        response = safeFailure(new ResumeProcessingError(code, message));
        child.kill("SIGKILL");
      };
      const cancel = () => stop("CANCELLED", "Processing was cancelled.");
      const timer = setTimeout(() => stop("TIMEOUT", "This document took too long to process. Try a simpler file or paste your resume text."), PARSE_TIMEOUT_MS);
      child.once("error", () => { child.kill("SIGKILL"); finish(); });
      child.once("exit", finish);
      child.once("message", (message: unknown) => {
        if (response) return;
        const parsed = extractionResponseSchema.safeParse(message);
        response = parsed.success ? parsed.data : safeFailure(undefined);
        // Terminate even if a parser leaves an internal worker or handle alive.
        child.kill("SIGKILL");
      });
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      else child.send(input, (error) => { if (error) { response = safeFailure(undefined); child.kill("SIGKILL"); } });
    });
  } catch {
    return safeFailure(undefined);
  } finally {
    active -= 1;
  }
}
