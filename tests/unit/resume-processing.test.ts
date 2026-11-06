import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeResumeText } from "@/server/resume-processing/normalize";
import { assessExtraction } from "@/server/resume-processing/quality";
import { processResume } from "@/server/resume-processing/process-resume";
import { validateDocument } from "@/server/resume-processing/file-validation";
import { safeFailure } from "@/server/resume-processing/errors";
import { parseExtractionRequest } from "@/server/resume-processing/request";
import { resumeTextSchema } from "@/lib/resume/contracts";
import { MAX_FILE_BYTES } from "@/lib/resume/limits";
import { syntheticPdf, syntheticResume } from "../fixtures/pdf";
import { syntheticDocx } from "../fixtures/docx";

function jsonRequest(value: unknown) {
  return new Request("http://localhost/api/resume/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
}

describe("structure-preserving normalization and edited text", () => {
  it("preserves paragraphs, headings, bullets, indentation, and hyphenated lines", () => {
    expect(normalizeResumeText("  EXPERIENCE\r\n\r\n\r\n  ● Built   reliable\ttools\r\nlong-\r\nterm work  ")).toBe("EXPERIENCE\n\n  • Built reliable tools\nlong-\nterm work");
  });
  it("normalizes presentation noise without losing Unicode letters", () => {
    expect(normalizeResumeText("ﬁrm team​\u0000 Résumé﻿")).toBe("firm team\n\nRésumé");
  });
  it("accepts real edits, but rejects empty, tiny, symbol-only, and oversized confirmation", () => {
    expect(resumeTextSchema.parse(`${syntheticResume}\nEdited by the user.`)).toContain("Edited by the user.");
    for (const text of ["", " ".repeat(100), "too short", "! ".repeat(40), "a".repeat(80_001)]) expect(resumeTextSchema.safeParse(text).success).toBe(false);
  });
  it("rejects empty or insufficient extraction, without producing a quality score", () => {
    expect(() => assessExtraction(" \n")).toThrow(expect.objectContaining({ code: "EMPTY_TEXT" }));
    expect(() => assessExtraction("Some short text")).toThrow(expect.objectContaining({ code: "INSUFFICIENT_TEXT" }));
    expect(() => assessExtraction("a".repeat(80_001))).toThrow(expect.objectContaining({ code: "TEXT_TOO_LONG" }));
  });
  it("warns for short or garbled but usable extraction", () => {
    expect(assessExtraction("A fictional engineer built tools and tested reliable software for teams.").warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "low-text" })]));
    expect(assessExtraction(`${syntheticResume} ���`).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "partial" })]));
  });
});

describe("real synthetic document processing", () => {
  it("extracts a PDF, preserving headings and line breaks", async () => {
    const data = await processResume({ kind: "pdf", bytes: await syntheticPdf() });
    expect(data.source).toBe("pdf");
    expect(data.text).toContain("EXPERIENCE\n");
    expect(data.text).toContain("- Improved automated tests");
    expect(data.stats.pages).toBe(1);
    expect(data.warnings).toContainEqual(expect.objectContaining({ code: "layout" }));
  });
  it("extracts a real DOCX with headings, bullets, and table content", async () => {
    const data = await processResume({ kind: "docx", bytes: await syntheticDocx() });
    expect(data.source).toBe("docx");
    expect(data.text).toContain("Experience\n");
    expect(data.text).toContain("• Improved synthetic test coverage");
    expect(data.text).toContain("TypeScript");
  });
  it.each(["pdf", "docx"] as const)("rejects an empty %s as an extraction failure", async (kind) => {
    const bytes = kind === "pdf" ? await syntheticPdf("") : await syntheticDocx("");
    await expect(processResume({ kind, bytes })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
  });
  it("rejects insufficient PDF text", async () => {
    await expect(processResume({ kind: "pdf", bytes: await syntheticPdf("Short") })).rejects.toMatchObject({ code: "INSUFFICIENT_TEXT" });
  });
  it("rejects corrupt and header-only PDFs", async () => {
    for (const text of ["%PDF-1.7 synthetic", "%PDF-1.7\ncorrupt\n%%EOF"]) await expect(processResume({ kind: "pdf", bytes: Buffer.from(text) })).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });
  it("rejects more than 20 PDF pages", async () => {
    await expect(processResume({ kind: "pdf", bytes: await syntheticPdf("", 21) })).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });
  it("normalizes pasted text through the same quality checks", async () => {
    const data = await processResume({ kind: "pasted", text: `  ${syntheticResume}\r\n` });
    expect(data.text).toBe(syntheticResume);
    expect(data.source).toBe("pasted");
  });
});

describe("authoritative input boundary", () => {
  it("rejects spoofed metadata, zero bytes, oversized bytes, and mismatched signatures", () => {
    for (const [bytes, name, type] of [
      [Buffer.from("not a PDF"), "resume.pdf", "application/pdf"],
      [Buffer.from("%PDF-1.7"), "resume.pdf", "image/png"],
      [Buffer.from("%PDF-1.7"), "resume.exe", "application/pdf"],
      [Buffer.alloc(0), "resume.pdf", "application/pdf"],
      [Buffer.alloc(MAX_FILE_BYTES + 1), "resume.pdf", "application/pdf"],
    ] as const) expect(() => validateDocument(bytes, name, type)).toThrow();
  });
  it("does not expose arbitrary exception details", () => {
    expect(JSON.stringify(safeFailure(new Error("private resume text")))).not.toContain("private resume text");
  });
  it("parses a bounded multipart upload and ignores claimed file sizes", async () => {
    const body = new FormData();
    body.set("file", new File([new Uint8Array(await syntheticPdf())], "resume.pdf", { type: "application/pdf" }));
    const input = await parseExtractionRequest(new Request("http://localhost", { method: "POST", body }));
    expect(input.kind).toBe("pdf");
  });
  it("accepts JSON text and rejects unknown fields or nonstrings", async () => {
    expect(await parseExtractionRequest(jsonRequest({ text: syntheticResume }))).toEqual({ kind: "pasted", text: syntheticResume });
    for (const input of [{ text: 123 }, { text: syntheticResume, unexpected: true }, {}]) await expect(parseExtractionRequest(jsonRequest(input))).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("rejects oversized pasted text", async () => {
    await expect(parseExtractionRequest(jsonRequest({ text: "a".repeat(80_001) }))).rejects.toMatchObject({ code: "TEXT_TOO_LONG" });
  });
  it("rejects repeated multipart fields", async () => {
    const body = new FormData();
    body.append("file", new File(["%PDF-"], "resume.pdf"));
    body.append("file", new File(["%PDF-"], "other.pdf"));
    await expect(parseExtractionRequest(new Request("http://localhost", { method: "POST", body }))).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("rejects malformed multipart and JSON", async () => {
    for (const contentType of ["multipart/form-data", "application/json"]) await expect(parseExtractionRequest(new Request("http://localhost", { method: "POST", headers: { "Content-Type": contentType }, body: "broken" }))).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("bounds the actual body even with a false Content-Length", async () => {
    const request = new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "1" }, body: "a".repeat(500_000) });
    await expect(parseExtractionRequest(request)).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});
