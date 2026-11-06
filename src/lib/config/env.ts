import { z } from "zod";

const geminiEnvironmentSchema = z.object({
  GEMINI_API_KEY: z.string().trim().min(1),
  GEMINI_MODEL: z.string().trim().min(1),
});

export type GeminiEnvironment = z.infer<typeof geminiEnvironmentSchema>;

/** Pure validator. Never include supplied values in configuration errors. */
export function parseGeminiEnvironment(input: unknown): GeminiEnvironment {
  const result = geminiEnvironmentSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      "Gemini configuration is missing or invalid. Set GEMINI_API_KEY and GEMINI_MODEL on the server.",
    );
  }

  return result.data;
}
