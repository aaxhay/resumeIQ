import { afterEach, describe, expect, it, vi } from "vitest";
import { Packer } from "docx";
import mammoth from "mammoth";
import {
  DOCX_CONTENT_TYPE, EXPORT_FILENAME, exportFailureSchema, exportRequestSchema,
  MAX_EXPORT_BYTES, MAX_EXPORT_PARAGRAPHS, MAX_EXPORT_TEXT,
} from "../../src/lib/resume-export/contracts.ts";
import { generateResumeDocx } from "../../src/server/documents/generate-resume-docx.ts";
import { ResumeExportError } from "../../src/server/documents/errors.ts";
import { acceptSuggestion, createImprovementSession, editSuggestion, rejectSuggestion } from "../../src/lib/resume-improvement/editor.ts";
import { validAiReview } from "../fixtures/ai-review.ts";
import { unpackDocx, zipParts, type ZipPart } from "../fixtures/docx.ts";

vi.mock("server-only", () => ({}));
afterEach(() => vi.restoreAllMocks());

function lines(text: string): string[] {
  return text.split(/\r\n?|\n/u).map(line => line.replace(/\s+/gu, " ").trim()).filter(Boolean);
}

function xml(parts: ZipPart[], name: string): string {
  const part = parts.find(part => part.name === name);
  if (!part) throw new Error(`Missing test document part: ${name}`);
  return part.data.toString("utf8");
}

async function roundtrip(text: string): Promise<string[]> {
  const bytes = await generateResumeDocx(text);
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.length).toBeLessThanOrEqual(MAX_EXPORT_BYTES);
  const extracted = await mammoth.extractRawText({ buffer: bytes });
  expect(extracted.messages).toEqual([]);
  return lines(extracted.value);
}

describe("shared export contracts", () => {
  it("fixes filename, MIME and bounded current-improved-text capacity", () => {
    expect(EXPORT_FILENAME).toBe("improved-resume.docx");
    expect(DOCX_CONTENT_TYPE).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(MAX_EXPORT_TEXT).toBe(80_000 + 12 * 2_500);
    expect(MAX_EXPORT_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_EXPORT_PARAGRAPHS).toBeGreaterThanOrEqual(2_000);
    expect(exportRequestSchema.parse({ text: "  Current text  " })).toEqual({ text: "  Current text  " });
  });

  it.each([null, {}, { text: 42 }, { text: "Resume", originalText: "Other" }, { text: "Resume", layout: "original" }])("rejects malformed or additional request fields (%#)", request => {
    expect(exportRequestSchema.safeParse(request).success).toBe(false);
  });

  it.each(["INVALID_REQUEST", "BUSY", "GENERATION_FAILED", "INVALID_DOCUMENT"])("accepts only the strict safe error envelope (%s)", code => {
    const error = { code, message: "Safe message" };
    expect(exportFailureSchema.safeParse({ ok: false, error }).success).toBe(true);
    expect(exportFailureSchema.safeParse({ ok: false, error, text: "private" }).success).toBe(false);
    expect(exportFailureSchema.safeParse({ ok: false, error: { ...error, cause: "private" } }).success).toBe(false);
    expect(exportFailureSchema.safeParse({ ok: false, error: { ...error, code: "RAW_ERROR" } }).success).toBe(false);
  });
});

describe("editable DOCX export", () => {
  it("preserves all contacts, standard and unfamiliar sections in source order without invented headings", async () => {
    const text = [
      "Synthetic Person", "synthetic@example.invalid | +1 202 555 0100 | example.invalid/profile",
      "Summary", "Builds synthetic systems.", "Experience", "Fictional Company — Engineer",
      "2021–Present", "Education", "Example Institute, BSc, 2017",
      "Skills", "C++, C#, TypeScript", "Projects", "A synthetic project",
      "Certifications", "Example certificate", "Languages", "English, 日本語",
      "Awards", "Synthetic prize", "Volunteering", "Community event",
      "Publications", "Synthetic paper", "Interests", "Walking",
      "UNFAMILIAR HEADING", "Unusual content must survive.", "Other bespoke section:", "Last detail",
    ].join("\n");
    expect(await roundtrip(text)).toEqual(lines(text));
    const parts = await unpackDocx(await generateResumeDocx(text));
    const document = xml(parts, "word/document.xml");
    expect(document.match(/<w:pStyle w:val="Heading1"\/>/gu)).toHaveLength(11);
    expect(document).not.toMatch(/<w:pStyle w:val="(?:Title|Heading2)"/u);
  });

  it("uses Arial 11, explicit heading hierarchy, standard editable bullets, spacing and three-quarter-inch margins", async () => {
    const parts = await unpackDocx(await generateResumeDocx("Summary:\nPlain paragraph\nExperience\n• Built tools\n- Wrote guides\n* Tested tools"));
    const document = xml(parts, "word/document.xml");
    const styles = xml(parts, "word/styles.xml");
    const numbering = xml(parts, "word/numbering.xml");
    expect(styles).toContain('w:ascii="Arial"');
    expect(styles).toContain('<w:sz w:val="22"/>');
    expect(styles).toContain('w:styleId="Heading1"');
    expect(document).toMatch(/<w:pgMar[^>]*w:top="1080"[^>]*w:right="1080"[^>]*w:bottom="1080"[^>]*w:left="1080"/u);
    expect(document).toContain('w:line="264"');
    expect(document.match(/<w:numPr>/gu)).toHaveLength(3);
    expect(numbering).toContain('<w:numFmt w:val="bullet"/>');
    expect(document).not.toMatch(/<w:(?:tbl|drawing|pict|cols|hyperlink|altChunk)\b/u);
    expect(parts.some(part => part.name.startsWith("word/media/"))).toBe(false);
    const html = await mammoth.convertToHtml({ buffer: zipParts(parts) });
    expect(html.value).toContain("<h1>Summary:</h1>");
    expect(html.value).toContain("<ul><li>Built tools</li><li>Wrote guides</li><li>Tested tools</li></ul>");
  });

  it("does not infer a name or headings from the first line, contacts, skills inline or unknown headings", async () => {
    const text = "Experience with TypeScript\nSKILLS IN CONTEXT\nSkills: C++ and C#\n2020-2024\nexample@example.invalid";
    expect(await roundtrip(text)).toEqual(lines(text));
    const parts = await unpackDocx(await generateResumeDocx(text));
    expect(xml(parts, "word/document.xml")).not.toContain('<w:pStyle w:val="Heading1"/>');
  });

  it("preserves empty explicit sections, adjacent headings and trailing headings without swallowing text", async () => {
    const text = "Summary\n\nExperience\nEducation\nExample qualification\nSkills:\n\nUnknown empty section:\n\nProjects";
    expect(await roundtrip(text)).toEqual(lines(text));
  });

  it("preserves every date token, separator and precision without guessing a missing month or year", async () => {
    const text = "Experience\n2018 - 2020\nJan 2021–Present\n03/04/2022 — 2023-05\nSpring 2020 to Current\n2024\nSeptember–December 2019\nSince 06/22";
    expect(await roundtrip(text)).toEqual(lines(text));
  });

  it("escapes literal XML and preserves special Unicode, programming languages, emoji and non-Latin text", async () => {
    const text = "Synthetic <Person> & Partners\nC++ / C# / R&D / café / é / € / £\n日本語 العربية हिन्दी 中文 — 👩🏽‍💻 🚀\n<script>alert(\"text\")</script> & 'quotes'\n• Built <tools> & libraries";
    expect(await roundtrip(text)).toEqual(lines(text.replace("• ", "")));
    const document = xml(await unpackDocx(await generateResumeDocx(text)), "word/document.xml");
    expect(document).toContain("&lt;Person&gt; &amp; Partners");
    expect(document).not.toContain("<script>");
  });

  it("handles whitespace and line endings while preserving nonblank lines and repeated content", async () => {
    const text = "  Summary  \r\n\r\nFirst\tsecond\rRepeated\nRepeated\n  Last  \n";
    expect(await roundtrip(text)).toEqual(lines(text));
    expect(await roundtrip(`One${String.fromCharCode(0x2028)}Two${String.fromCharCode(0x2029)}Three`)).toEqual(["One", "Two", "Three"]);
  });

  it("converts clear bullets but retains numeric, currency, numbered-list and standalone markers literally", async () => {
    const text = "• Built tools\n◦ Wrote guides\n▪ Tested systems\n● 20 projects\n- 日本語\n* C++\n- 10% loss\n- $100\n1. First\n2) Second\n2020-2023\n•\n-\n*\n* 42\nC#";
    expect(await roundtrip(text)).toEqual([
      "Built tools", "Wrote guides", "Tested systems", "20 projects", "日本語", "C++",
      "- 10% loss", "- $100", "1. First", "2) Second", "2020-2023", "•", "-", "*", "* 42", "C#",
    ]);
  });

  it("roundtrips the exact 110k text limit without the upload extractor's 80k truncation", async () => {
    const text = "x".repeat(MAX_EXPORT_TEXT);
    expect(await roundtrip(text)).toEqual([text]);
  });

  it("roundtrips the exact paragraph limit, including repeated paragraphs", async () => {
    const text = Array.from({ length: MAX_EXPORT_PARAGRAPHS }, (_, index) => `Line ${index}`).join("\n");
    expect(await roundtrip(text)).toEqual(lines(text));
  }, 15_000);

  it("exports only accepted current text from the actual improvement engine, not rejected or pending drafts", async () => {
    const original = "Experience\nBuilt tools.\nWrote guides.\nTested systems.";
    const review = validAiReview();
    review.priorities = review.priorities.map(item => ({ ...item, resumeEvidence: ["Built tools."] }));
    review.strengths = review.strengths.map(item => ({ ...item, resumeEvidence: ["Built tools."] }));
    review.findings = ["Built tools.", "Wrote guides.", "Tested systems."].map((quote, index) => ({
      id: `edit-${index}`, area: "experience", impact: "medium", issue: "Review wording.",
      whyItMatters: "Improve readability.", recommendation: "Check the wording.", resumeEvidence: [quote], suggestedRewrite: null,
    }));
    let session = createImprovementSession(original, review, original);
    for (const [id, replacement] of [["edit-0", "Built helpful tools."], ["edit-1", "REJECTED DRAFT"], ["edit-2", "PENDING DRAFT"]]) {
      if (!id || !replacement) throw new Error("Invalid fixture");
      const result = editSuggestion(session, id, replacement);
      if (!result.ok) throw new Error(result.error);
      session = result.state;
    }
    const accepted = acceptSuggestion(session, "edit-0", session.revision);
    if (!accepted.ok) throw new Error(accepted.error);
    const rejected = rejectSuggestion(accepted.state, "edit-1");
    if (!rejected.ok) throw new Error(rejected.error);
    expect(await roundtrip(rejected.state.modifiedText)).toEqual(["Experience", "Built helpful tools.", "Wrote guides.", "Tested systems."]);
    expect(rejected.state.originalText).toBe(original);
  });
});

describe("bounded export validation and safe failures", () => {
  it.each([
    "", " \t\n\r", `Before${String.fromCharCode(0)}After`, `Before${String.fromCharCode(11)}After`,
    `Before${String.fromCharCode(31)}After`, String.fromCharCode(0xfffe), String.fromCharCode(0xffff),
    String.fromCharCode(0xd800), String.fromCharCode(0xdc00), `Before${String.fromCharCode(0xd800)}After`,
    "x".repeat(MAX_EXPORT_TEXT + 1), Array(MAX_EXPORT_PARAGRAPHS + 1).fill("Line").join("\n"),
    `Resume${"\n".repeat(MAX_EXPORT_PARAGRAPHS)}`,
  ])("rejects empty, XML-invalid, lone-surrogate or over-limit text before packing (%#)", async text => {
    const pack = vi.spyOn(Packer, "toBuffer");
    expect(exportRequestSchema.safeParse({ text }).success).toBe(false);
    await expect(generateResumeDocx(text)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(pack).not.toHaveBeenCalled();
  });

  it("wraps packer failures without leaking source, raw errors or causes", async () => {
    vi.spyOn(Packer, "toBuffer").mockRejectedValue(new Error("PRIVATE_RESUME_CONTENT /private/path"));
    const error: unknown = await generateResumeDocx("PRIVATE_RESUME_CONTENT").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ResumeExportError);
    expect(error).toMatchObject({ code: "GENERATION_FAILED" });
    expect(String(error)).not.toContain("PRIVATE_RESUME_CONTENT");
    expect(error).not.toHaveProperty("cause");
  });

  it.each([Buffer.alloc(0), Buffer.from("not a docx"), Buffer.from("PK\x03\x04broken"), Buffer.alloc(MAX_EXPORT_BYTES + 1)])("rejects empty, corrupt or oversized generated bytes (%#)", async bytes => {
    vi.spyOn(Packer, "toBuffer").mockResolvedValue(bytes);
    await expect(generateResumeDocx("Resume")).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it("rejects a structurally invalid generated archive even when it contains matching text", async () => {
    const parts = await unpackDocx(await generateResumeDocx("Resume"));
    vi.spyOn(Packer, "toBuffer").mockResolvedValue(zipParts(parts.filter(part => part.name !== "[Content_Types].xml")));
    await expect(generateResumeDocx("Resume")).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it.each(["Resume", "Resume\nResume\nMissing", "Missing\nResume", "Resume\nMissing\nInvented"]) ("rejects valid DOCX with dropped, repeated, reordered or invented content (%#)", async incorrect => {
    const wrong = await generateResumeDocx(incorrect);
    vi.spyOn(Packer, "toBuffer").mockResolvedValue(wrong);
    await expect(generateResumeDocx("Resume\nMissing")).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it("wraps re-extraction failures without exposing parser details", async () => {
    vi.spyOn(mammoth, "extractRawText").mockRejectedValue(new Error("PRIVATE_RESUME_CONTENT"));
    const error: unknown = await generateResumeDocx("Resume").catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "INVALID_DOCUMENT" });
    expect(String(error)).not.toContain("PRIVATE_RESUME_CONTENT");
  });

  it("refuses converter warnings even when text matches", async () => {
    vi.spyOn(mammoth, "extractRawText").mockResolvedValue({ value: "Resume", messages: [{ type: "warning", message: "PRIVATE_RESUME_CONTENT" }] });
    await expect(generateResumeDocx("Resume")).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });
});
