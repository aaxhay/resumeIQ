import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
vi.mock("server-only", () => ({}));
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
import { runWorker } from "@/server/resume-processing/run-worker";
import { PARSE_TIMEOUT_MS } from "@/lib/resume/limits";
import { syntheticResume } from "../fixtures/pdf";

function mockChild() {
  const child = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    kill: vi.fn(() => { queueMicrotask(() => child.emit("exit", null, "SIGKILL")); return true; }),
  });
  spawn.mockReturnValue(child);
  return child;
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
describe("killable parser lifecycle", () => {
  it("returns validated output and terminates the parser", async () => {
    const child = mockChild();
    const result = runWorker({ kind: "pasted", text: syntheticResume });
    const envelope = { ok: true, data: { source: "pasted", text: syntheticResume, warnings: [], stats: { characters: syntheticResume.length, words: 45 } } };
    child.emit("message", envelope);
    expect(await result).toEqual(envelope);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(spawn.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["--max-old-space-size=192"]));
    expect(spawn.mock.calls[0]?.[2]).toMatchObject({ stdio: ["ignore", "ignore", "ignore", "ipc"] });
  });
  it("kills timed-out work, not merely the awaiting promise", async () => {
    vi.useFakeTimers();
    const child = mockChild();
    const result = runWorker({ kind: "pasted", text: syntheticResume });
    await vi.advanceTimersByTimeAsync(PARSE_TIMEOUT_MS);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(await result).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
  });
  it("aborts active processing and refuses an already-aborted request", async () => {
    const child = mockChild();
    const controller = new AbortController();
    const result = runWorker({ kind: "pasted", text: syntheticResume }, controller.signal);
    controller.abort();
    expect(await result).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(child.kill).toHaveBeenCalled();
    spawn.mockClear();
    expect(await runWorker({ kind: "pasted", text: syntheticResume }, controller.signal)).toMatchObject({ ok: false, error: { code: "CANCELLED" } });
    expect(spawn).not.toHaveBeenCalled();
  });
  it("bounds concurrent processes and releases slots after exit", async () => {
    const first = mockChild();
    const a = runWorker({ kind: "pasted", text: syntheticResume });
    const second = mockChild();
    const b = runWorker({ kind: "pasted", text: syntheticResume });
    expect(await runWorker({ kind: "pasted", text: syntheticResume })).toMatchObject({ ok: false, error: { code: "BUSY" } });
    first.emit("exit", 1); second.emit("exit", 1);
    await Promise.all([a, b]);
    const third = mockChild();
    const c = runWorker({ kind: "pasted", text: syntheticResume });
    third.emit("exit", 1);
    expect(await c).toMatchObject({ ok: false, error: { code: "PROCESSING_FAILED" } });
  });
  it("rejects invalid IPC output without exposing its contents", async () => {
    const child = mockChild();
    const result = runWorker({ kind: "pasted", text: syntheticResume });
    child.emit("message", { private: "resume data" });
    expect(await result).toMatchObject({ ok: false, error: { code: "PROCESSING_FAILED" } });
  });
});
