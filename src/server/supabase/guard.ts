import "server-only";
import { AccountError } from "./errors";

let active = 0;
const starts: Record<"auth" | "read" | "write", number[]> = { auth: [], read: [], write: [] };
const limits = { auth: 10, read: 60, write: 20 } as const;
/** Process-local resource bounds only. Public deployment still needs per-user/distributed controls. */
export function acquireAccountSlot(): () => void {
  if (active >= 4) throw new AccountError("BUSY", 429);
  active++;
  let released = false;
  return () => { if (!released) { active--; released = true; } };
}
/** Charge validated operations only; malformed bodies must not consume Auth allowance. */
export function consumeAccountAllowance(kind: keyof typeof limits): void {
  const now = Date.now();
  starts[kind] = starts[kind].filter(value => now - value < 60_000);
  if (starts[kind].length >= limits[kind]) throw new AccountError("BUSY", 429);
  starts[kind].push(now);
}
export function acquireAccountOperation(kind: keyof typeof limits): () => void {
  const release = acquireAccountSlot();
  try { consumeAccountAllowance(kind); return release; }
  catch (error) { release(); throw error; }
}
