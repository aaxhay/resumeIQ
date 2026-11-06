import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractRawText } from "mammoth";
import { DOCX_CONTENT_TYPE, EXPORT_FILENAME, exportFailureSchema, MAX_EXPORT_TEXT } from "@/lib/resume-export/contracts";

vi.mock("server-only", () => ({}));
const generate = vi.hoisted(() => vi.fn<(text: string) => Promise<Buffer>>());
vi.mock("@/server/documents/generate-resume-docx", () => ({ generateResumeDocx: generate }));
const url = "http://localhost:3100/api/resume/export";
const text = "Fictional Example\nfictional@example.test\nSUMMARY\nSoftware developer.\nEXPERIENCE\n- Built reliable tools.\nEDUCATION\nExample University\nSKILLS\nTypeScript";
let POST: typeof import("@/app/api/resume/export/route").POST;
const request = (body: unknown = { text }, init: RequestInit = {}) => new Request(url, { method: "POST", body: JSON.stringify(body), ...init, headers: init.headers ?? { Origin: "http://localhost:3100", "Content-Type": "application/json" } });
async function failure(response: Response, status: number, code = "INVALID_REQUEST") {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toBeNull();
  const body = exportFailureSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(JSON.stringify(body)).not.toContain("PRIVATE_GENERATOR_DETAIL");
}

beforeEach(async () => {
  vi.resetModules(); generate.mockReset();
  const real = await vi.importActual<typeof import("@/server/documents/generate-resume-docx")>("@/server/documents/generate-resume-docx");
  generate.mockImplementation(real.generateResumeDocx);
  ({ POST } = await import("@/app/api/resume/export/route"));
});
afterEach(() => vi.useRealTimers());

describe("DOCX export route", () => {
  it("returns an actual editable DOCX with contact details, safe headers and no AI dependency", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(DOCX_CONTENT_TYPE);
    expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${EXPORT_FILENAME}"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.length).toBe(Number(response.headers.get("content-length")));
    expect((await extractRawText({ buffer })).value).toContain("fictional@example.test");
    expect(generate).toHaveBeenCalledExactlyOnceWith(text);
  });
  it.each([{}, { text: "" }, { text: "  \n\t " }, { text: 42 }, { text, extra: true }, { text: "a".repeat(MAX_EXPORT_TEXT + 1) }, { text: "text\u0000invalid" }])("rejects invalid input before generation %#", async body => {
    await failure(await POST(request(body)), 400); expect(generate).not.toHaveBeenCalled();
  });
  it.each([
    { "Content-Type": "application/json" },
    { Origin: "https://foreign.invalid", "Content-Type": "application/json" },
    { Origin: "http://localhost:3100", "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
  ])("rejects missing/foreign origin %#", async headers => { await failure(await POST(request({ text }, { headers: new Headers(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")) })), 403); expect(generate).not.toHaveBeenCalled(); });
  it("uses the browser Host when the internal Next hostname differs", async () => {
    expect((await POST(request({ text }, { headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "Content-Type": "application/json; charset=utf-8" } }))).status).toBe(200);
  });
  it("rejects wrong content type and malformed JSON/UTF-8", async () => {
    await failure(await POST(request({ text }, { headers: { Origin: "http://localhost:3100", "Content-Type": "text/plain" } })), 400);
    await failure(await POST(request({}, { body: "{" })), 400);
    await failure(await POST(request({}, { body: new Uint8Array([0xc3, 0x28]) })), 400);
    expect(generate).not.toHaveBeenCalled();
  });
  it("bounds actual streamed bytes even with a false Content-Length", async () => {
    const bytes = new Uint8Array(MAX_EXPORT_TEXT * 6 + 1025);
    await failure(await POST(request({}, { body: bytes, headers: { Origin: "http://localhost:3100", "Content-Type": "application/json", "Content-Length": "1" } })), 413);
    expect(generate).not.toHaveBeenCalled();
  });
  it("cancels stalled request reads and releases their concurrency slot", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request(url, { method: "POST", body: stream, duplex: "half", headers: { Origin: "http://localhost:3100", "Content-Type": "application/json" } } as RequestInit);
    const pending = POST(req);
    await vi.advanceTimersByTimeAsync(10_001);
    await failure(await pending, 400); expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects cancellation before generation", async () => {
    const controller = new AbortController(); controller.abort();
    await failure(await POST(request({ text }, { signal: controller.signal })), 400); expect(generate).not.toHaveBeenCalled();
  });
  it("hides generator failures and releases the export slot", async () => {
    generate.mockRejectedValue(new Error("PRIVATE_GENERATOR_DETAIL"));
    for (let i = 0; i < 3; i++) await failure(await POST(request()), 500, "GENERATION_FAILED");
  });
  it("returns safe invalid-structure errors", async () => {
    // Import after module reset to share the runtime class identity with the route.
    const { ResumeExportError: CurrentError } = await import("@/server/documents/errors");
    generate.mockRejectedValue(new CurrentError("INVALID_DOCUMENT"));
    await failure(await POST(request()), 500, "INVALID_DOCUMENT");
  });
  it("limits concurrent generation and returns Retry-After", async () => {
    let resolve: ((bytes: Buffer) => void) | undefined;
    const held = new Promise<Buffer>(done => { resolve = done; });
    generate.mockReturnValue(held);
    const one = POST(request()); const two = POST(request());
    const busy = await POST(request());
    await failure(busy, 429, "BUSY"); expect(busy.headers.get("retry-after")).toBe("60");
    resolve!(Buffer.from("synthetic generator boundary mock"));
    await Promise.all([one, two]);
  });
  it("bounds repeated generation admissions per minute", async () => {
    generate.mockResolvedValue(Buffer.from("synthetic generator boundary mock"));
    for (let i = 0; i < 20; i++) expect((await POST(request())).status).toBe(200);
    await failure(await POST(request()), 429, "BUSY"); expect(generate).toHaveBeenCalledTimes(20);
  });
});
