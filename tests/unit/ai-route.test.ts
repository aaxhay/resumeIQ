import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeAiProvider } from "@/server/ai/provider";
import { reviewResponseSchema } from "@/lib/ai-review/contracts";
import { aiJob, aiQuote, aiResume, validAiReview } from "../fixtures/ai-review";
import { analyzeJobDescription } from "@/server/ai/job-analysis";

vi.mock("server-only", () => ({}));
const provider = vi.hoisted(() => ({
  model: "mock-only-gemini",
  analyzeResume: vi.fn<ResumeAiProvider["analyzeResume"]>(),
  analyzeJobMatch: vi.fn<ResumeAiProvider["analyzeJobMatch"]>(),
  rewriteResumeBullet: vi.fn<ResumeAiProvider["rewriteResumeBullet"]>(),
}));
const factory = vi.hoisted(() => vi.fn());
vi.mock("@/server/ai/gemini", () => ({ createGeminiProvider: factory }));

let POST: typeof import("@/app/api/reviews/route").POST;
let AiError: typeof import("@/server/ai/errors").AiError;
const url = "http://localhost:3100/api/reviews";
function input(overrides: Record<string, unknown> = {}) {
  return { mode: "general", resumeText: aiResume, confirmed: true, consent: true, synthetic: true, requestId: randomUUID(), ...overrides };
}
function request(body: unknown = input(), init: RequestInit = {}) {
  return new Request(url, { method: "POST", body: JSON.stringify(body), ...init, headers: init.headers ?? { Origin: "http://localhost:3100", "Content-Type": "application/json" } });
}
async function failure(response: Response, status: number, code: string, retryable = false) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const body: unknown = await response.json();
  expect(reviewResponseSchema.safeParse(body).success).toBe(true);
  expect(body).toMatchObject({ ok: false, error: { code, retryable } });
  return body;
}
function expectNoProvider() {
  expect(factory).not.toHaveBeenCalled();
  expect(provider.analyzeResume).not.toHaveBeenCalled();
  expect(provider.analyzeJobMatch).not.toHaveBeenCalled();
}

beforeEach(async () => {
  // Fresh real guard state; the only application mock is the provider boundary.
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("GEMINI_DATA_POLICY", "synthetic-only");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
  factory.mockReturnValue(provider);
  provider.analyzeResume.mockResolvedValue(validAiReview());
  provider.analyzeJobMatch.mockResolvedValue(validAiReview(true));
  ({ POST } = await import("@/app/api/reviews/route"));
  ({ AiError } = await import("@/server/ai/errors"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("AI route through real request, privacy, validation, and guard boundaries", () => {
  it("accepts a confirmed synthetic general review and returns the validated contract", async () => {
    const req = request();
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({ ok: true, data: validAiReview(), jobAnalysis: null, model: provider.model, redacted: false });
    expect(provider.analyzeResume).toHaveBeenCalledExactlyOnceWith(aiResume, req.signal);
    expect(provider.analyzeJobMatch).not.toHaveBeenCalled();
  });

  it("uses the job-specific provider method with both validated documents", async () => {
    const req = request(input({ mode: "job-specific", jobDescription: aiJob }));
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: validAiReview(true), jobAnalysis: analyzeJobDescription(validAiReview(true), aiResume, aiJob), model: provider.model, redacted: false });
    expect(provider.analyzeJobMatch).toHaveBeenCalledExactlyOnceWith(aiResume, aiJob, req.signal);
    expect(provider.analyzeResume).not.toHaveBeenCalled();
  });

  it("builds job fields and unassessed requirements from the minimized submitted description", async () => {
    const jobDescription = "Job title: Developer\nCompany: contact@example.test\nRequired skills: TypeScript, SQL\nPreferred skills: Kubernetes\nEducation:\n- Bachelor degree";
    const data = validAiReview(true);
    data.jobMatches[0]!.jobEvidence = "TypeScript";
    data.jobMatches[1]!.jobEvidence = "Kubernetes";
    provider.analyzeJobMatch.mockResolvedValue(data);
    const response = await POST(request(input({ mode: "job-specific", jobDescription })));
    expect(response.status).toBe(200);
    const body = reviewResponseSchema.parse(await response.json());
    if (!body.ok || !body.jobAnalysis) throw new Error("Expected validated job analysis");
    expect(body.redacted).toBe(true);
    expect(body.jobAnalysis.profile.title?.value).toBe("Developer");
    expect(body.jobAnalysis.profile.company?.value).toBe("[email removed]");
    expect(JSON.stringify(body)).not.toContain("contact@example.test");
    expect(body.jobAnalysis.comparisons).toContainEqual(expect.objectContaining({ requirement: "SQL", status: "not_assessed", resumeEvidence: [] }));
    expect(provider.analyzeJobMatch).toHaveBeenCalledTimes(1);
    const minimizedJob = provider.analyzeJobMatch.mock.calls[0]![1];
    for (const item of body.jobAnalysis.comparisons) {
      expect(minimizedJob).toContain(item.jobEvidence);
      for (const quote of item.resumeEvidence) expect(aiResume).toContain(quote);
    }
    for (const item of body.jobAnalysis.profile.requirements) {
      expect(minimizedJob.slice(item.evidence.start, item.evidence.end)).toBe(item.evidence.text);
    }
  });

  it.each([
    ["missing confirmation", { confirmed: undefined }],
    ["false confirmation", { confirmed: false }],
    ["missing consent", { consent: undefined }],
    ["false consent", { consent: false }],
    ["string consent", { consent: "true" }],
    ["missing synthetic declaration", { synthetic: undefined }],
    ["empty resume", { resumeText: "" }],
    ["whitespace resume", { resumeText: " ".repeat(50) }],
    ["too few words", { resumeText: "a".repeat(60) }],
    ["oversized resume", { resumeText: `${aiResume}${"x".repeat(30_001)}` }],
    ["unknown field", { apiKey: "do-not-forward" }],
    ["invalid request ID", { requestId: "not-a-uuid" }],
    ["unknown mode", { mode: "rewrite" }],
    ["job description in general mode", { jobDescription: aiJob }],
    ["missing job description", { mode: "job-specific" }],
    ["empty job description", { mode: "job-specific", jobDescription: "" }],
    ["oversized job description", { mode: "job-specific", jobDescription: "x".repeat(10_001) }],
  ])("rejects %s before creating a provider", async (_name, overrides) => {
    await failure(await POST(request(input(overrides))), 400, "INVALID_REQUEST");
    expectNoProvider();
  });

  it.each([
    ["missing origin", { "Content-Type": "application/json" }],
    ["foreign origin", { Origin: "https://unrelated.invalid", "Content-Type": "application/json" }],
    ["wrong port", { Origin: "http://localhost:3101", "Content-Type": "application/json" }],
    ["wrong scheme", { Origin: "https://localhost:3100", "Content-Type": "application/json" }],
    ["cross-site metadata", { Origin: "http://localhost:3100", "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }],
  ])("rejects %s", async (_name, headers) => {
    await failure(await POST(request(input(), { headers })), 403, "INVALID_REQUEST");
    expectNoProvider();
  });

  it("honors the browser Host when the internal Next URL differs", async () => {
    const response = await POST(request(input(), { headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "Content-Type": "application/json; charset=utf-8" } }));
    expect(response.status).toBe(200);
    expect(provider.analyzeResume).toHaveBeenCalledOnce();
  });

  it.each(["text/plain", "multipart/form-data", "application/x-www-form-urlencoded"]) ("rejects media type %s", async (mediaType) => {
    await failure(await POST(request(input(), { headers: { Origin: "http://localhost:3100", "Content-Type": mediaType } })), 400, "INVALID_REQUEST");
    expectNoProvider();
  });

  it.each(["{not json", "null", "[]"]) ("rejects malformed/non-object JSON %s", async (body) => {
    await failure(await POST(request(undefined, { body })), 400, "INVALID_REQUEST");
    expectNoProvider();
  });

  it("rejects a missing body", async () => {
    await failure(await POST(request(undefined, { body: null })), 400, "INVALID_REQUEST");
    expectNoProvider();
  });

  it("rejects declared oversized bodies before processing", async () => {
    await failure(await POST(request(input(), { headers: { Origin: "http://localhost:3100", "Content-Type": "application/json", "Content-Length": "250001" } })), 413, "INVALID_REQUEST");
    expectNoProvider();
  });

  it("enforces actual streamed byte size without trusting Content-Length and cancels the reader", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(125_000)); controller.enqueue(new Uint8Array(125_001)); }, cancel });
    const init: RequestInit & { duplex: "half" } = { body, duplex: "half", headers: { Origin: "http://localhost:3100", "Content-Type": "application/json", "Content-Length": "1" } };
    await failure(await POST(request(undefined, init)), 413, "INVALID_REQUEST");
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expectNoProvider();
  });

  it("rejects invalid UTF-8 instead of silently replacing bytes", async () => {
    const body = new Uint8Array([0xc3, 0x28]);
    await failure(await POST(request(undefined, { body })), 400, "INVALID_REQUEST");
    expectNoProvider();
  });

  it("cancels and unlocks a pending body read when the caller aborts", async () => {
    const abort = new AbortController();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const init: RequestInit & { duplex: "half" } = { body, duplex: "half", signal: abort.signal };
    const pending = POST(request(undefined, init));
    abort.abort();
    await failure(await pending, 400, "INVALID_REQUEST");
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expectNoProvider();
  });

  it("times out and cleans up a stalled request body", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const init: RequestInit & { duplex: "half" } = { body, duplex: "half" };
    const pending = POST(request(undefined, init));
    await vi.advanceTimersByTimeAsync(10_000);
    await failure(await pending, 400, "INVALID_REQUEST");
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expectNoProvider();
  });

  it.each([undefined, "synthetic-only", "paid", "PAID-REVIEWED"]) ("blocks personal documents under policy %s", async (policy) => {
    vi.stubEnv("GEMINI_DATA_POLICY", policy);
    await failure(await POST(request(input({ synthetic: false }))), 403, "PRIVACY_GATE");
    expectNoProvider();
  });

  it("permits explicitly consented personal documents under paid-reviewed policy", async () => {
    vi.stubEnv("GEMINI_DATA_POLICY", "paid-reviewed");
    expect((await POST(request(input({ synthetic: false })))).status).toBe(200);
    expect(provider.analyzeResume).toHaveBeenCalledOnce();
  });

  it("minimizes contacts in both documents before provider invocation and output revalidation", async () => {
    const contacts = "example.person@example.invalid +1 (202) 555-0147 https://example.invalid/profile";
    const resumeText = `${aiResume}\r\n${contacts}`;
    const jobDescription = `${aiJob}\r\n${contacts}`;
    const response = await POST(request(input({ mode: "job-specific", resumeText, jobDescription })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, redacted: true });
    const [resume, job] = provider.analyzeJobMatch.mock.calls[0]!;
    expect(resume).toBe(`${aiResume}\n[email removed] [phone removed] [link removed]`);
    expect(job).toBe(`${aiJob}\n[email removed] [phone removed] [link removed]`);
  });

  it("rejects provider evidence containing contact text removed from the source", async () => {
    const output = validAiReview();
    output.priorities[0]!.resumeEvidence = ["example.person@example.invalid"];
    provider.analyzeResume.mockResolvedValue(output);
    const response = await POST(request(input({ resumeText: `${aiResume}\nexample.person@example.invalid` })));
    const body = await failure(response, 502, "INVALID_RESPONSE", true);
    expect(JSON.stringify(body)).not.toContain("example.person@example.invalid");
  });

  it("revalidates minimum text bounds after contact minimization", async () => {
    const resumeText = `https://example.invalid/${"x".repeat(100)} a b c d e f g`;
    await failure(await POST(request(input({ resumeText }))), 400, "INVALID_REQUEST");
    expectNoProvider();
  });

  it.each([
    ["TIMEOUT", 504, "Gemini did not respond in time. Your text is unchanged."],
    ["RATE_LIMIT", 429, "Gemini's project quota or rate limit was reached."],
  ] as const)("safely surfaces normalized provider %s errors", async (code, status, message) => {
    provider.analyzeResume.mockRejectedValue(new AiError(code, message, status, true));
    const response = await POST(request());
    if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
    expect(await failure(response, status, code, true)).toEqual({ ok: false, error: { code, message, retryable: true } });
  });

  it("does not expose raw provider errors, secrets, or document text", async () => {
    provider.analyzeResume.mockRejectedValue(new Error(`secret-api-key raw provider response ${aiResume}`));
    const body = await failure(await POST(request()), 502, "PROVIDER_ERROR", true);
    expect(JSON.stringify(body)).not.toMatch(/secret-api-key|raw provider response|Fictional Example|Built TypeScript/);
  });

  it.each([
    ["missing exact resume evidence", (review: ReturnType<typeof validAiReview>) => { review.priorities[0]!.resumeEvidence = ["Built Python tools for internal documentation."]; }],
    ["empty required evidence", (review: ReturnType<typeof validAiReview>) => { review.priorities[0]!.resumeEvidence = []; }],
    ["fabricated metric", (review: ReturnType<typeof validAiReview>) => { review.assessment = "Improved efficiency by 87%."; }],
    ["invented rewrite", (review: ReturnType<typeof validAiReview>) => { review.findings[0]!.suggestedRewrite = { original: aiQuote, revised: "Built TypeScript tools and increased revenue by 87%." }; }],
  ])("server revalidation rejects %s even when the provider returns it", async (_name, mutate) => {
    const output = validAiReview(); mutate(output);
    provider.analyzeResume.mockResolvedValue(output);
    await failure(await POST(request()), 502, "INVALID_RESPONSE", true);
    expect(provider.analyzeResume).toHaveBeenCalledOnce();
  });

  it("rejects an unsupported skill claimed as supported despite other exact resume evidence", async () => {
    const output = validAiReview(true);
    output.jobMatches[1]!.status = "supported";
    output.jobMatches[1]!.resumeEvidence = [aiQuote];
    provider.analyzeJobMatch.mockResolvedValue(output);
    await failure(await POST(request(input({ mode: "job-specific", jobDescription: aiJob }))), 502, "INVALID_RESPONSE", true);
  });

  it.each(["same ID", "same input"])("rejects a concurrent duplicate with %s without another provider call", async (duplicate) => {
    const started = Promise.withResolvers<void>();
    const result = Promise.withResolvers<ReturnType<typeof validAiReview>>();
    provider.analyzeResume.mockImplementationOnce(() => { started.resolve(); return result.promise; });
    const first = input();
    const pending = POST(request(first));
    await started.promise;
    try {
      const second = duplicate === "same ID" ? { ...first, resumeText: `${aiResume}\nDifferent supplied context.` } : input();
      const response = await POST(request(second));
      expect(response.headers.get("retry-after")).toBe("60");
      await failure(response, 409, "DUPLICATE", true);
      expect(provider.analyzeResume).toHaveBeenCalledOnce();
    } finally { result.resolve(validAiReview()); }
    expect((await pending).status).toBe(200);
  });

  it("detects duplicate minimized documents even when contact details differ", async () => {
    expect((await POST(request(input({ resumeText: `${aiResume}\nfirst@example.invalid` })))).status).toBe(200);
    await failure(await POST(request(input({ resumeText: `${aiResume}\nsecond@example.invalid` }))), 409, "DUPLICATE", true);
    expect(provider.analyzeResume).toHaveBeenCalledOnce();
  });

  it("releases the active slot after cancellation while retaining input cooldown", async () => {
    const firstStarted = Promise.withResolvers<void>();
    const secondStarted = Promise.withResolvers<void>();
    const secondResult = Promise.withResolvers<ReturnType<typeof validAiReview>>();
    const abort = new AbortController();
    provider.analyzeResume.mockImplementationOnce((_text, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new AiError("CANCELLED", "The request was cancelled.", 499, true)), { once: true });
      firstStarted.resolve();
    })).mockImplementationOnce(() => { secondStarted.resolve(); return secondResult.promise; });
    const cancelled = POST(request(input(), { signal: abort.signal }));
    await firstStarted.promise;
    const second = POST(request(input({ resumeText: `${aiResume}\nSecond review context.` })));
    await secondStarted.promise;
    try {
      await failure(await POST(request(input({ resumeText: `${aiResume}\nThird review context.` }))), 429, "BUSY", true);
      abort.abort();
      await failure(await cancelled, 499, "CANCELLED", true);
      await failure(await POST(request(input())), 409, "DUPLICATE", true);
      expect((await POST(request(input({ resumeText: `${aiResume}\nThird review context.` })))).status).toBe(200);
      expect(provider.analyzeResume).toHaveBeenCalledTimes(3);
    } finally { abort.abort(); secondResult.resolve(validAiReview()); }
    expect((await second).status).toBe(200);
  });
});
