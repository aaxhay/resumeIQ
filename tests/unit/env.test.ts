import { describe, expect, it } from "vitest";
import { parseGeminiEnvironment } from "@/lib/config/env";

// Synthetic strings only: these tests never access real secrets or the network.
const validEnvironment = {
  GEMINI_API_KEY: "test-only-not-a-real-key",
  GEMINI_MODEL: "test-only-model",
};

describe("Gemini environment validation", () => {
  it("accepts explicit provider configuration", () => {
    expect(parseGeminiEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("trims surrounding whitespace and strips unrelated fields", () => {
    expect(
      parseGeminiEnvironment({
        GEMINI_API_KEY: ` ${validEnvironment.GEMINI_API_KEY} `,
        GEMINI_MODEL: ` ${validEnvironment.GEMINI_MODEL} `,
        UNRELATED_SECRET: "must-not-be-forwarded",
      }),
    ).toEqual(validEnvironment);
  });

  it.each([
    undefined,
    null,
    {},
    { GEMINI_MODEL: "test-only-model" },
    { GEMINI_API_KEY: "test-only-key" },
    { ...validEnvironment, GEMINI_API_KEY: "   " },
    { ...validEnvironment, GEMINI_MODEL: 123 },
  ])("rejects missing or malformed configuration: %j", (input) => {
    expect(() => parseGeminiEnvironment(input)).toThrow(
      "Gemini configuration is missing or invalid",
    );
  });

  it("does not disclose supplied secrets in errors", () => {
    const secret = "sensitive-test-value";
    let caught: unknown;
    try {
      parseGeminiEnvironment({ GEMINI_API_KEY: secret });
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).not.toContain(secret);
  });
});
