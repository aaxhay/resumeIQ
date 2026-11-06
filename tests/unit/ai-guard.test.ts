import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createReviewGuard } from "@/server/ai/guard";
import { AiError } from "@/server/ai/errors";

function setup() {
  let time = 0;
  return { acquire: createReviewGuard(() => time), advance: (milliseconds: number) => { time += milliseconds; } };
}
function expectFailure(action: () => unknown, code: string, status: number) {
  expect(action).toThrow(AiError);
  expect(action).toThrow(expect.objectContaining({ code, status, retryable: true }));
}

describe("local AI request guard", () => {
  it("permits two concurrent distinct inputs and releases a slot", () => {
    const { acquire } = setup();
    const release = acquire("first", "first input");
    acquire("second", "second input");
    expectFailure(() => acquire("third", "third input"), "BUSY", 429);
    release();
    expect(acquire("third", "third input")).toBeTypeOf("function");
  });

  it("rejects the same request ID even when its input changes", () => {
    const { acquire } = setup();
    acquire("same-id", "first input");
    expectFailure(() => acquire("same-id", "changed input"), "DUPLICATE", 409);
  });

  it("rejects the same active input under another request ID", () => {
    const { acquire, advance } = setup();
    acquire("first", "same input");
    advance(300_000);
    expectFailure(() => acquire("different-id", "same input"), "DUPLICATE", 409);
  });

  it("keeps request IDs for five minutes, independently of input cooldown", () => {
    const { acquire, advance } = setup();
    acquire("same-id", "first input")();
    advance(299_999);
    expectFailure(() => acquire("same-id", "changed input"), "DUPLICATE", 409);
    advance(1);
    expect(acquire("same-id", "changed input")).toBeTypeOf("function");
  });

  it("starts the thirty-second input cooldown at release, not acquisition", () => {
    const { acquire, advance } = setup();
    const release = acquire("first", "same input");
    advance(45_000);
    release();
    advance(29_999);
    expectFailure(() => acquire("second", "same input"), "DUPLICATE", 409);
    advance(1);
    expect(acquire("second", "same input")).toBeTypeOf("function");
  });

  it("makes release idempotent without extending cooldown or releasing another operation", () => {
    const { acquire, advance } = setup();
    const release = acquire("first", "same input");
    release();
    advance(20_000);
    release();
    advance(10_000);
    acquire("second", "same input");
    acquire("third", "other input");
    release();
    expectFailure(() => acquire("fourth", "new input"), "BUSY", 429);
    expectFailure(() => acquire("fifth", "same input"), "DUPLICATE", 409);
  });

  it("caps successful acquisitions at ten per minute and resets at the boundary", () => {
    const { acquire, advance } = setup();
    for (let index = 0; index < 10; index++) acquire(`id-${index}`, `input-${index}`)();
    expectFailure(() => acquire("next", "next input"), "RATE_LIMIT", 429);
    advance(59_999);
    expectFailure(() => acquire("next", "next input"), "RATE_LIMIT", 429);
    advance(1);
    expect(acquire("next", "next input")).toBeTypeOf("function");
  });

  it("does not count rejected duplicate or busy requests toward the minute cap", () => {
    const { acquire } = setup();
    const first = acquire("first", "first input");
    const second = acquire("second", "second input");
    for (let index = 0; index < 12; index++) {
      expectFailure(() => acquire("first", "changed input"), "DUPLICATE", 409);
      expectFailure(() => acquire("waiting", "waiting input"), "BUSY", 429);
    }
    first(); second();
    for (let index = 0; index < 8; index++) acquire(`id-${index}`, `input-${index}`)();
    expectFailure(() => acquire("next", "next input"), "RATE_LIMIT", 429);
  });

  it("caps a day at one hundred acquisitions despite minute resets", () => {
    const { acquire, advance } = setup();
    for (let minute = 0; minute < 10; minute++) {
      for (let index = 0; index < 10; index++) acquire(`${minute}-${index}`, `input-${minute}-${index}`)();
      advance(60_000);
    }
    expectFailure(() => acquire("next", "next input"), "RATE_LIMIT", 429);
    advance(86_400_000 - 600_000 - 1);
    expectFailure(() => acquire("next", "next input"), "RATE_LIMIT", 429);
    advance(1);
    expect(acquire("next", "next input")).toBeTypeOf("function");
  });

  it("does not expire active concurrency slots when daily counters reset", () => {
    const { acquire, advance } = setup();
    acquire("first", "first input");
    acquire("second", "second input");
    advance(86_400_000);
    expectFailure(() => acquire("third", "third input"), "BUSY", 429);
  });
});
