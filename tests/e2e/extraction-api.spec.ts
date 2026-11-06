import { expect, test } from "@playwright/test";
import { syntheticPdf, syntheticResume } from "../fixtures/pdf";

const endpoint = "/api/resume/extract";
test("API validates direct requests without relying on browser screening", async ({ request }) => {
  const cases = [
    { name: "resume.exe", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7"), code: "UNSUPPORTED_FORMAT", status: 415 },
    { name: "resume.pdf", mimeType: "image/png", buffer: Buffer.from("%PDF-1.7"), code: "UNSUPPORTED_FORMAT", status: 415 },
    { name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a PDF"), code: "MALFORMED_FILE", status: 422 },
    { name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0), code: "MALFORMED_FILE", status: 422 },
    { name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 1), code: "FILE_TOO_LARGE", status: 413 },
    { name: "resume.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from([80, 75, 3, 4, 0]), code: "MALFORMED_FILE", status: 422 },
  ];
  for (const { code, status, ...file } of cases) {
    const response = await request.post(endpoint, { multipart: { file } });
    expect(response.status()).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, error: { code } });
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});

test("API reports empty and corrupt documents as processing errors", async ({ request }) => {
  for (const [buffer, code] of [[await syntheticPdf(""), "EMPTY_TEXT"], [Buffer.from("%PDF-1.7 broken"), "MALFORMED_FILE"]] as const) {
    const response = await request.post(endpoint, { multipart: { file: { name: "resume.pdf", mimeType: "application/pdf", buffer } } });
    expect(response.status()).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code } });
  }
});

test("API handles pasted text, rejects extra fields and cross-site requests", async ({ request }) => {
  const response = await request.post(endpoint, { data: { text: syntheticResume } });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ ok: true, data: { source: "pasted", text: syntheticResume } });
  const extra = await request.post(endpoint, { data: { text: syntheticResume, instructions: "not allowed" } });
  expect(extra.status()).toBe(400);
  const crossSite = await request.post(endpoint, { headers: { Origin: "https://example.invalid" }, data: { text: syntheticResume } });
  expect(crossSite.status()).toBe(400);
  const malformed = await request.post(endpoint, { headers: { "Content-Type": "application/json" }, data: "{" });
  expect(malformed.status()).toBe(400);
});
