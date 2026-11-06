import "server-only";
import { AccountError } from "./errors";

let active = 0;
const starts: Record<"auth" | "read" | "write", number[]> = { auth: [], read: [], write: [] };
const limits = { auth: 10, read: 60, write: 20 } as const;
/** Process-local resource bounds only. Public deployment still needs per-user/distributed controls. */
export function acquireAccountOperation(kind: keyof typeof limits): () => void {
  const now = Date.now();
  starts[kind] = starts[kind].filter(value => now - value < 60_000);
  if (active >= 4 || starts[kind].length >= limits[kind]) throw new AccountError("BUSY", 429);
  starts[kind].push(now); active++;
  let released = false;
  return () => { if (!released) { active--; released = true; } };
}
