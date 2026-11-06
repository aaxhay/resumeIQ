import { describe, expect, it } from "vitest";
import { formatFileSize, getJobDescriptionError, inspectResumeFile, MAX_FILE_BYTES, reviewSetupSchema, validateFileMetadata } from "@/features/review/validation";

const pdf = { name: "resume.pdf", size: 128, type: "application/pdf" };
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("resume file metadata", () => {
  it.each([
    pdf,
    { ...pdf, name: "RESUME.PDF" },
    { ...pdf, type: "" },
    { ...pdf, type: "application/octet-stream" },
    { ...pdf, size: MAX_FILE_BYTES },
    { name: "resume.docx", size: 100, type: docxType },
  ])("accepts supported metadata: %j", (file) => {
    expect(validateFileMetadata(file).ok).toBe(true);
  });

  it.each([
    { ...pdf, size: 0 },
    { ...pdf, size: -1 },
    { ...pdf, size: MAX_FILE_BYTES + 1 },
    { ...pdf, name: "resume.doc" },
    { ...pdf, name: "resume.pdf.exe" },
    { ...pdf, name: "resume" },
    { ...pdf, name: "pdf" },
    { ...pdf, name: "resume.zip" },
    { ...pdf, type: "image/png" },
    null,
    {},
  ])("rejects invalid metadata: %j", (file) => {
    expect(validateFileMetadata(file).ok).toBe(false);
  });
});

describe("local file header screening", () => {
  it("accepts a PDF header without claiming to parse it", async () => {
    expect(await inspectResumeFile(new File(["%PDF-1.7 synthetic fixture"], "resume.pdf", { type: "application/pdf" }))).toEqual({ ok: true, kind: "pdf" });
  });

  it("accepts a DOCX ZIP header only as a basic container check", async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])], "resume.docx", { type: docxType });
    expect(await inspectResumeFile(file)).toEqual({ ok: true, kind: "docx" });
  });

  it.each(["renamed plain text", "%PDF", ""])("rejects bad or truncated header %j", async (content) => {
    expect((await inspectResumeFile(new File([content], "resume.pdf"))).ok).toBe(false);
  });

  it("reports read failures without leaking raw errors", async () => {
    const file = new File(["%PDF-1.7"], "resume.pdf");
    file.slice = () => { throw new Error("private-system-detail"); };
    const result = await inspectResumeFile(file);
    expect(result).toEqual({ ok: false, code: "MALFORMED_FILE", message: "We couldn’t read this file. Try selecting it again or choose another file." });
  });

  it("formats file sizes for display", () => {
    expect(formatFileSize(512)).toBe("1 KB");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(MAX_FILE_BYTES)).toBe("5.0 MB");
  });
});

describe("review setup contract", () => {
  it("does not require or retain a job description in general mode", () => {
    expect(reviewSetupSchema.parse({ mode: "general", jobDescription: "irrelevant" })).toEqual({ mode: "general" });
  });

  it("requires meaningful-length job text for job-specific mode", () => {
    expect(reviewSetupSchema.safeParse({ mode: "job-specific" }).success).toBe(false);
    expect(getJobDescriptionError(" ".repeat(80))).toContain("at least 50");
    expect(getJobDescriptionError("a".repeat(49))).toContain("at least 50");
    expect(getJobDescriptionError("a".repeat(50))).toBeUndefined();
  });

  it("enforces the raw maximum without silently truncating input", () => {
    expect(getJobDescriptionError("a".repeat(10_000))).toBeUndefined();
    expect(getJobDescriptionError("a".repeat(10_001))).toContain("10,000");
    expect(getJobDescriptionError(` ${"a".repeat(10_000)} `)).toContain("10,000");
  });

  it("trims valid job text and rejects unknown modes", () => {
    expect(reviewSetupSchema.parse({ mode: "job-specific", jobDescription: ` ${"a".repeat(50)} ` })).toEqual({ mode: "job-specific", jobDescription: "a".repeat(50) });
    expect(reviewSetupSchema.safeParse({ mode: "invented" }).success).toBe(false);
  });
});
