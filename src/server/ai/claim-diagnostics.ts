/** Validator-owned codes and schema paths only. Never encode document text or model prose. */
export type ClaimProblem = {
  reason: "unsupported-requirement-claim" | "introduced-number" | "unsupported-job-claim" | "unsupported-prose-claim";
  path: string;
};
const PREFIX = "claim-checks:";
const MAX_PROBLEMS = 24;
const index = "(?:[0-9]|1[0-9])";
const prosePath = new RegExp(`^(?:assessment|priorities\\.${index}\\.(?:title|recommendation)|strengths\\.${index}\\.(?:title|explanation)|areas\\.${index}\\.explanation|findings\\.${index}\\.(?:issue|whyItMatters|recommendation)|jobMatches\\.${index}\\.(?:explanation|recommendation)|limitations\\.${index})$`, "u");
const matchPath = new RegExp(`^jobMatches\\.${index}\\.status$`, "u");
function valid(problem: ClaimProblem): boolean {
  return problem.reason === "unsupported-requirement-claim" ? matchPath.test(problem.path)
    : ["introduced-number", "unsupported-job-claim", "unsupported-prose-claim"].includes(problem.reason) && prosePath.test(problem.path);
}
export function encodeClaimProblems(problems: readonly ClaimProblem[]): string {
  if (!problems.length || problems.some(problem => !valid(problem))) throw new Error("Invalid internal claim diagnostic");
  return PREFIX + problems.slice(0, MAX_PROBLEMS).map(problem => `${problem.reason}@${problem.path}`).join(";");
}
export function decodeClaimProblems(reason: unknown): ClaimProblem[] | undefined {
  if (typeof reason !== "string" || !reason.startsWith(PREFIX) || reason.length > 2500) return undefined;
  const entries = reason.slice(PREFIX.length).split(";");
  if (!entries.length || entries.length > MAX_PROBLEMS) return undefined;
  const problems: ClaimProblem[] = [];
  for (const entry of entries) {
    const [kind, path, extra] = entry.split("@");
    if (extra !== undefined || path === undefined || (kind !== "introduced-number" && kind !== "unsupported-requirement-claim" && kind !== "unsupported-job-claim" && kind !== "unsupported-prose-claim")) return undefined;
    const problem: ClaimProblem = { reason: kind, path };
    if (!valid(problem)) return undefined;
    problems.push(problem);
  }
  return problems;
}
