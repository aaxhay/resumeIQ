import { z } from "zod";
/** Keep the generation schema simple enough for Gemini's constrained decoder.
 * The complete Zod bounds/strictness remain mandatory AFTER generation. */
export function generationSchema(schema: z.ZodType): unknown {
  function simplify(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(simplify);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !["$schema", "minLength", "maxLength", "pattern", "minItems", "maxItems"].includes(key))
      .map(([key, item]) => [key, simplify(item)]));
    return value;
  }
  return simplify(z.toJSONSchema(schema));
}
