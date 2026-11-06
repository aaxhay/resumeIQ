import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mammoth from "mammoth";
import { Document, ExternalHyperlink, Footer, Header, Packer, Paragraph, TextRun } from "docx";
import { extractionResponseSchema, warningSchema } from "../../src/lib/resume/contracts.ts";
import { processResume } from "../../src/server/resume-processing/process-resume.ts";
import { MAX_EXPANDED_BYTES, MAX_FILE_BYTES, MAX_XML_BYTES, MAX_ZIP_ENTRIES } from "../../src/lib/resume/limits.ts";
import { extractDocx } from "../../src/server/resume-processing/docx.ts";
import { docxHtmlToText } from "../../src/server/resume-processing/docx-text.ts";
import { ResumeProcessingError } from "../../src/server/resume-processing/errors.ts";
import { syntheticDocx, unpackDocx, zipParts } from "../fixtures/docx.ts";
import type { ZipPart } from "../fixtures/docx.ts";

vi.mock("server-only", () => ({}));

describe("DOCX extraction", () => {
  let original: Buffer;
  let parts: ZipPart[];
  beforeAll(async () => {
    original = await syntheticDocx();
    parts = await unpackDocx(original);
  });
  afterEach(() => vi.restoreAllMocks());

  function changeXml(name: string, transform: (xml: string) => string): Buffer {
    return zipParts(parts.map((part) => part.name === name
      ? { ...part, data: Buffer.from(transform(part.data.toString("utf8"))) } : part));
  }

  it("extracts real generated headings, paragraphs, both kinds of lists, and table cells", async () => {
    const result = await extractDocx(original);
    expect(result.text).toContain("Synthetic Candidate\n\nBuilt reliable services & tools");
    expect(result.text).toContain("Experience\n\n• Improved synthetic test coverage\n• Documented fictional workflows");
    expect(result.text).toContain("1. Plan the work\n2. Verify the work");
    expect(result.text).toContain("Skill\tTypeScript");
    expect(result.text).not.toMatch(/<\/?(?:p|h1|li|table)\b/u);
    expect(result.warnings).toEqual([]);
  });

  it("returns empty raw text for a valid empty document", async () => {
    expect((await extractDocx(await syntheticDocx(""))).text).toBe("");
  });

  it.each(["header", "footer", "both"])("refuses a real DOCX with meaningful %s text rather than silently dropping it", async location => {
    const bytes = await Packer.toBuffer(new Document({ sections: [{
      ...(location !== "footer" ? { headers: { default: new Header({ children: [new Paragraph("Synthetic Candidate | synthetic@example.invalid")] }) } } : {}),
      ...(location !== "header" ? { footers: { default: new Footer({ children: [new Paragraph("Certification: Synthetic Certificate 2024")] }) } } : {}),
      children: [new Paragraph("Experience"), new Paragraph("Built reliable software services for fictional teams and improved the test suite across all internal tools. Delivered documented release processes and maintained TypeScript applications for synthetic customers. Worked with a collaborative engineering team to plan and test the release.")],
    }] }));
    const convert = vi.spyOn(mammoth, "convertToHtml");
    await expect(extractDocx(bytes)).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
      message: expect.stringMatching(/header or footer text.*paste the complete resume/u),
    });
    expect(convert).not.toHaveBeenCalled();
  });

  it("allows empty headers and footers without losing body text", async () => {
    const text = "Synthetic Candidate — all contact details and qualifications are in the body.";
    const bytes = await Packer.toBuffer(new Document({ sections: [{
      headers: { default: new Header({ children: [new Paragraph("  ")] }) },
      footers: { default: new Footer({ children: [new Paragraph("")] }) },
      children: [new Paragraph(text)],
    }] }));
    expect(await extractDocx(bytes)).toEqual({ text, warnings: [] });
  });

  it("warns about hidden destinations in a real DOCX without changing visible text or exposing URLs", async () => {
    const body = "Built reliable software services for fictional teams and improved the test suite across all internal tools. Delivered documented release processes and maintained TypeScript applications for synthetic customers. Worked with a collaborative engineering team to plan and test the release.";
    const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [
      new Paragraph("Synthetic Candidate"),
      new Paragraph({ children: [
        new ExternalHyperlink({ children: [new TextRun("Email")], link: "mailto:synthetic@example.invalid" }),
        new TextRun(" | "),
        new ExternalHyperlink({ children: [new TextRun("Profile")], link: "https://example.invalid/PRIVATE_DESTINATION" }),
      ] }),
      new Paragraph(body),
    ] }] }));
    const result = await processResume({ kind: "docx", bytes });
    expect(result.text).toBe(`Synthetic Candidate\n\nEmail | Profile\n\n${body}`);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ code: "partial", message: expect.stringMatching(/copy any needed email addresses, contact links, or profile URLs.*before confirming or exporting/u) });
    expect(extractionResponseSchema.safeParse({ ok: true, data: result }).success).toBe(true);
    expect(warningSchema.safeParse(result.warnings[0]).success).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/synthetic@example\.invalid|PRIVATE_DESTINATION|<a\b/u);
  });

  it("bounds static hyperlink warnings independently of converter warnings and link count", async () => {
    vi.spyOn(mammoth, "convertToHtml").mockResolvedValue({
      value: `<p>${'<a href="https://example.invalid/PRIVATE_DESTINATION">Profile</a> '.repeat(300)}</p>`,
      messages: Array.from({ length: 30 }, () => ({ type: "warning" as const, message: "PRIVATE_CONVERTER_DETAIL" })),
    });
    const result = await extractDocx(original);
    expect(result.warnings.map(warning => warning.code)).toEqual(["conversion", "partial"]);
    expect(result.warnings.every(warning => warningSchema.safeParse(warning).success)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_DESTINATION|PRIVATE_CONVERTER_DETAIL/u);
  });

  it("ignores bookmark-only and escaped links while retaining the text limit for real links", () => {
    const onLink = vi.fn();
    expect(docxHtmlToText('<p><a href="#section">Section</a> &lt;a href="hidden"&gt;literal&lt;/a&gt;</p>', onLink))
      .toBe('Section <a href="hidden">literal</a>');
    expect(onLink).not.toHaveBeenCalled();
    expect(() => docxHtmlToText(`<p><a href="https://example.invalid">${"x".repeat(80_001)}</a></p>`, onLink))
      .toThrow(expect.objectContaining({ code: "RESOURCE_LIMIT" }));
    expect(onLink).toHaveBeenCalledWith();
  });

  it("keeps literal escaped markup as inert text and never exposes HTML attributes", () => {
    expect(docxHtmlToText('<h1>Title</h1><p>&lt;script&gt;literal&lt;/script&gt; &amp; text</p><script>secret()</script><style>hidden</style><img src="private"><p>End</p>'))
      .toBe("Title\n\n<script>literal</script> & text\n\nEnd");
  });

  it("handles ordered-list starts and separate table rows", () => {
    expect(docxHtmlToText('<ol start="3"><li>Third</li><li>Fourth</li></ol><table><tr><td><p>A</p></td><td>B</td></tr><tr><td>C</td><td>D</td></tr></table>'))
      .toBe("3. Third\n4. Fourth\nA\tB\nC\tD");
  });

  it("uses safe converter options and reduces all warnings to one bounded generic warning", async () => {
    const spy = vi.spyOn(mammoth, "convertToHtml").mockResolvedValue({
      value: "<p>Safe extracted text</p>",
      messages: Array.from({ length: 30 }, () => ({ type: "warning" as const, message: "PRIVATE_RESUME_CONTENT /private/path" })),
    });
    const result = await extractDocx(original);
    expect(spy).toHaveBeenCalledWith({ buffer: original }, expect.objectContaining({
      externalFileAccess: false, includeEmbeddedStyleMap: false, convertImage: expect.any(Function),
    }));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe("conversion");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_RESUME_CONTENT");
    expect(result.warnings[0]?.message.length).toBeLessThan(500);
    const imageConverter: unknown = spy.mock.calls[0]?.[1]?.convertImage;
    expect(typeof imageConverter).toBe("function");
    if (typeof imageConverter !== "function") throw new Error("Missing image converter");
    const readImage = vi.fn(() => { throw new Error("Image bytes must not be read"); });
    await imageConverter({ read: readImage, readAsBuffer: readImage, readAsArrayBuffer: readImage, readAsBase64String: readImage });
    expect(readImage).not.toHaveBeenCalled();
  });

  it("does not leak raw converter failures", async () => {
    vi.spyOn(mammoth, "convertToHtml").mockRejectedValue(new Error("PRIVATE_RESUME_CONTENT"));
    await expect(extractDocx(original)).rejects.toMatchObject({ code: "MALFORMED_FILE" });
    await expect(extractDocx(original)).rejects.not.toThrow("PRIVATE_RESUME_CONTENT");
  });

  it.each([Buffer.from("not a zip"), Buffer.from("PK\x03\x04broken"), Buffer.alloc(0)])("rejects invalid ZIP input safely (%#)", async (bytes) => {
    await expect(extractDocx(bytes)).rejects.toBeInstanceOf(ResumeProcessingError);
    await expect(extractDocx(bytes)).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("rejects an arbitrary renamed ZIP", async () => {
    await expect(extractDocx(zipParts([{ name: "hello.txt", data: Buffer.from("hello") }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it.each(["[Content_Types].xml", "_rels/.rels", "word/document.xml"])("requires the OOXML part %s", async (name) => {
    await expect(extractDocx(zipParts(parts.filter((part) => part.name !== name)))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("rejects non-DOCX main content types", async () => {
    const bytes = changeXml("[Content_Types].xml", (xml) => xml.replace("wordprocessingml.document.main+xml", "spreadsheetml.sheet.main+xml"));
    await expect(extractDocx(bytes)).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("rejects a fake document root with the wrong namespace", async () => {
    const bytes = changeXml("word/document.xml", () => '<w:document xmlns:w="urn:fake"><w:body/></w:document>');
    await expect(extractDocx(bytes)).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("requires an internal main-document relationship", async () => {
    const bytes = changeXml("_rels/.rels", (xml) => xml.replace('Target="word/document.xml"', 'Target="https://example.invalid/private.xml" TargetMode="External"'));
    await expect(extractDocx(bytes)).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it.each([
    '<root><broken></root>',
    '<!DOCTYPE root [<!ENTITY secret "private">]><root>&secret;</root>',
    '<!ENTITY secret "private"><root/>',
    '<one/><two/>',
  ])("validates even unused XML and rejects declarations (%#)", async (xml) => {
    await expect(extractDocx(zipParts([...parts, { name: "unused.xml", data: Buffer.from(xml) }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it.each(["../escape.xml", "/absolute.xml", "word/../escape.xml", "word\\escape.xml", "%2e%2e/escape.xml"])("rejects unsafe ZIP paths (%s)", async (name) => {
    await expect(extractDocx(zipParts([...parts, { name, data: Buffer.from("<root/>") }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("rejects duplicate and case-ambiguous entries", async () => {
    for (const name of ["word/document.xml", "WORD/DOCUMENT.XML"]) {
      await expect(extractDocx(zipParts([...parts, { name, data: Buffer.from("<root/>") }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
    }
  });

  it("rejects local/central filename disagreement", async () => {
    await expect(extractDocx(zipParts([{ name: "safe.xml", localName: "evil.xml", data: Buffer.from("<root/>") }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("checks CRC even for unused binary entries", async () => {
    await expect(extractDocx(zipParts([...parts, { name: "unused.bin", data: Buffer.from("private"), checksum: 0 }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it.each([1, 1000])("checks streamed size against declared size (%i)", async (declaredSize) => {
    await expect(extractDocx(zipParts([{ name: "unused.bin", data: Buffer.alloc(50), declaredSize }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it.each([1, 0x40, 0x2000])("rejects encrypted ZIP flags (%i)", async (flags) => {
    await expect(extractDocx(zipParts([{ name: "unused.bin", data: Buffer.from("secret"), flags }]))).rejects.toMatchObject({ code: "PROTECTED_FILE" });
  });

  it("rejects the compound-container signature used by encrypted Office files", async () => {
    await expect(extractDocx(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).rejects.toMatchObject({ code: "PROTECTED_FILE" });
  });

  it("rejects macro parts and macro-enabled content types", async () => {
    await expect(extractDocx(zipParts([...parts, { name: "word/vbaProject.bin", data: Buffer.from("macro") }]))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
    await expect(extractDocx(changeXml("[Content_Types].xml", (xml) => xml.replace("wordprocessingml.document.main+xml", "wordprocessingml.document.macroEnabled.main+xml"))))
      .rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("enforces the compressed input size limit", async () => {
    await expect(extractDocx(Buffer.alloc(MAX_FILE_BYTES + 1))).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("enforces the entry-count limit", async () => {
    const entries = Array.from({ length: MAX_ZIP_ENTRIES + 1 }, (_, index) => ({ name: `${index}.bin`, data: Buffer.alloc(0) }));
    await expect(extractDocx(zipParts(entries))).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });

  it("enforces declared archive and per-file XML expansion limits before conversion", async () => {
    for (const part of [
      { name: "large.bin", data: Buffer.alloc(0), declaredSize: MAX_EXPANDED_BYTES + 1 },
      { name: "large.xml", data: Buffer.alloc(0), declaredSize: MAX_XML_BYTES + 1 },
    ]) {
      await expect(extractDocx(zipParts([part]))).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    }
  });

  it("rejects real highly compressed XML expansion", async () => {
    const bomb = zipParts([{ name: "large.xml", data: Buffer.alloc(MAX_XML_BYTES + 1, 32) }]);
    expect(bomb.length).toBeLessThan(20_000);
    await expect(extractDocx(bomb)).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });

  it("enforces cumulative expansion across entries", async () => {
    const chunk = Buffer.alloc(7 * 1024 * 1024);
    const bomb = zipParts([0, 1, 2].map((index) => ({ name: `large-${index}.bin`, data: chunk })));
    await expect(extractDocx(bomb)).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });

  it("accepts the exact 80k text boundary without counting trailing paragraph separators", async () => {
    expect((await extractDocx(await syntheticDocx("x".repeat(80_000)))).text).toHaveLength(80_000);
  });

  it("rejects XML content disguised with a binary extension", async () => {
    const renamed = parts.map((part) => {
      if (part.name === "word/styles.xml") return { ...part, name: "word/styles.bin" };
      if (part.name === "[Content_Types].xml" || part.name === "word/_rels/document.xml.rels") {
        return { ...part, data: Buffer.from(part.data.toString("utf8").replaceAll("styles.xml", "styles.bin")) };
      }
      return part;
    });
    await expect(extractDocx(zipParts(renamed))).rejects.toMatchObject({ code: "MALFORMED_FILE" });
  });

  it("rejects over-80k extracted text instead of truncating", async () => {
    await expect(extractDocx(await syntheticDocx("x".repeat(80_001)))).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
  });
});
