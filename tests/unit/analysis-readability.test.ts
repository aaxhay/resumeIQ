import { describe, expect, it } from "vitest";
import { parseResume } from "@/lib/resume-analysis/parse";
import { checkBulletFormatting, checkLongParagraphs, checkRepeatedWords, checkTextDensity } from "@/lib/resume-analysis/readability";

const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(" ");

describe("long paragraphs", () => {
  it("only triggers above 100 words", () => {
    expect(checkLongParagraphs(parseResume(words(100)))).toEqual([]);
    expect(checkLongParagraphs(parseResume(words(101)))[0]?.description).toContain("101 words");
  });
  it("honors paragraph breaks and excludes bullet lists", () => {
    expect(checkLongParagraphs(parseResume(`${words(60)}\n\n${words(60)}`))).toEqual([]);
    expect(checkLongParagraphs(parseResume(`- ${words(101)}`))).toEqual([]);
  });
});

describe("text density", () => {
  it("requires both 180 words and three consecutive nonempty lines", () => {
    expect(checkTextDensity(parseResume(`${words(60)}\n${words(60)}\n${words(59)}`))).toEqual([]);
    expect(checkTextDensity(parseResume(`${words(90)}\n${words(90)}`))).toEqual([]);
    expect(checkTextDensity(parseResume(`${words(60)}\n${words(60)}\n${words(60)}`))[0]).toMatchObject({ rule_id: "readability.dense-text-block", confidence: "low", kind: "suggestion" });
  });
  it("does not claim visual density and does not combine blank-separated groups", () => {
    expect(checkTextDensity(parseResume(`${words(60)}\n\n${words(60)}\n\n${words(60)}`))).toEqual([]);
  });
});

describe("adjacent repeated words", () => {
  it("groups repeated runs and preserves exact source spans/case", () => {
    const findings = checkRepeatedWords(parseResume("EXPERIENCE\n- Built the The the release guide."));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ evidence_text: "the The the", kind: "objective", evidence_location: { start_line: 2, end_line: 2, start_offset: 19, end_offset: 30 } });
  });
  it("does not confuse punctuation, nonadjacent terms, or separate lines", () => {
    expect(checkRepeatedWords(parseResume("Tools, tools and other tools.\nTools"))).toEqual([]);
  });
  it("supports Unicode and makes no automatic grammar judgment", () => {
    expect(checkRepeatedWords(parseResume("Résumé résumé"))[0]?.evidence_text).toBe("Résumé résumé");
    expect(checkRepeatedWords(parseResume("had had"))[0]?.description).toContain("not automatically a grammatical error");
  });
});

describe("text-detectable bullet formatting", () => {
  it("requires three comparable bullets and detects mixed markers and punctuation", () => {
    const findings = checkBulletFormatting(parseResume("Experience\n- Built a guide.\n* Designed a tool\n• Documented a process."));
    expect(findings.map((finding) => finding.rule_id)).toEqual(["readability.mixed-bullet-markers", "readability.mixed-bullet-punctuation"]);
    expect(findings.every((finding) => finding.kind === "suggestion" && finding.confidence === "low")).toBe(true);
  });
  it("does not compare different sections or treat ordered numbers as mixed markers", () => {
    expect(checkBulletFormatting(parseResume("Experience\n- Built one.\n- Built two.\n- Built three.\nProjects\n* Made one\n* Made two\n* Made three"))).toEqual([]);
    expect(checkBulletFormatting(parseResume("Experience\n1. Built one.\n2. Built two.\n3. Built three."))).toEqual([]);
    expect(checkBulletFormatting(parseResume("Experience\n- Built one.\n* Built two"))).toEqual([]);
  });
});
