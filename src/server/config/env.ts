import "server-only";
import { parseGeminiEnvironment } from "@/lib/config/env";

/** Validate lazily: the foundation can build and run without AI credentials. */
export function getGeminiEnvironment() {
  return parseGeminiEnvironment({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  });
}
