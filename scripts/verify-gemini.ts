// Explicit opt-in live evaluation. Checked-in synthetic inputs only; may incur charges.
// Run: npm run test:ai:live (Node 24; uses .env.local and react-server conditions).
// Nine sequential cases, at most eighteen generations with normal provider correction.
// No harness retry, response logging, or quality claims based solely on valid JSON.
import { createGeminiProvider } from "../src/server/ai/gemini.ts";
import { safeAiFailure } from "../src/server/ai/errors.ts";
import { aiEvaluationCases } from "../tests/fixtures/ai-evaluation.ts";
import { runAiEvaluation } from "./ai-evaluation.ts";

try {
  const provider = createGeminiProvider();
  console.log(JSON.stringify({ evaluation: "synthetic-fixture-checks", cases: aiEvaluationCases.length, maxGenerations: aiEvaluationCases.length * 2, semanticQuality: "not-established" }));
  const summary = await runAiEvaluation(provider, aiEvaluationCases, event => console.log(JSON.stringify(event)));
  console.log(JSON.stringify({ evaluation: "summary", ...summary }));
  if (summary.failed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ evaluation: "not-started", errorCode: safeAiFailure(error).body.error.code }));
  process.exitCode = 1;
}
