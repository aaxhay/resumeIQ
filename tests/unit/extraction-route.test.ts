import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/resume-processing/run-worker", () => ({
  runWorker: vi.fn(async () => ({ ok: true, data: { source: "pasted", text: "Synthetic text", warnings: [], stats: { characters: 14, words: 2 } } })),
}));
import { POST } from "@/app/api/resume/extract/route";
import { syntheticResume } from "../fixtures/pdf";

describe("extraction route origin handling", () => {
  it("accepts browser Host when Next normalizes the internal URL hostname", async () => {
    const request = new Request("http://localhost:3100/api/resume/extract", {
      method: "POST",
      headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "Content-Type": "application/json" },
      body: JSON.stringify({ text: syntheticResume }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    { Origin: "https://unrelated.invalid" },
    { Origin: "https://127.0.0.1:3100" },
    { Origin: "http://127.0.0.1:3101" },
    { Origin: "http://127.0.0.1:3100", "Sec-Fetch-Site": "cross-site" },
  ])("rejects mismatched origins and cross-site metadata: %j", async (headers) => {
    const requestHeaders = new Headers({ Host: "127.0.0.1:3100", "Content-Type": "application/json" });
    for (const [key, value] of Object.entries(headers)) if (value !== undefined) requestHeaders.set(key, value);
    const request = new Request("http://localhost:3100/api/resume/extract", {
      method: "POST", headers: requestHeaders,
      body: JSON.stringify({ text: syntheticResume }),
    });
    expect((await POST(request)).status).toBe(400);
  });
});
