import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PARSER_PACKAGES, parserTraceIncludes } from "../../scripts/deployment-tracing.ts";
import { MAX_FILE_BYTES } from "../../src/lib/resume/limits.ts";
import { MAX_EXPORT_BYTES } from "../../src/lib/resume-export/contracts.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "resumeiq-trace-"));
  roots.push(root);
  for (const name of PARSER_PACKAGES) manifest(root, name);
  return root;
}
function manifest(parent: string, name: string, fields: Record<string, unknown> = {}): string {
  const directory = path.join(parent, "node_modules", name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name, ...fields }));
  return directory;
}

describe("deployment bounds and isolated worker packaging", () => {
  it("leaves multipart headroom below even a decimal 4.5 MB platform limit", () => {
    expect(MAX_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_FILE_BYTES + 64 * 1024).toBeLessThan(4_500_000);
    expect(MAX_EXPORT_BYTES).toBeLessThan(4_500_000);
  });
  it("includes owned TypeScript, package metadata, and all parser package assets", () => {
    const includes = parserTraceIncludes(fixture());
    expect(includes).toContain("./src/server/resume-processing/**/*.ts");
    expect(includes).toContain("./src/lib/resume/**/*.ts");
    expect(includes).toContain("./package.json");
    for (const name of PARSER_PACKAGES) expect(includes).toContain(`./node_modules/${name}/**/*`);
    expect(includes.some(value => /\.env|artifacts|node_modules\/\*\*/u.test(value))).toBe(false);
  });
  it("follows nested dependencies and packages named like Node builtins", () => {
    const root = fixture();
    const parent = manifest(root, "mammoth", { dependencies: { string_decoder: "1", nested: "1" } });
    manifest(root, "string_decoder");
    manifest(parent, "nested");
    const includes = parserTraceIncludes(root);
    expect(includes).toContain("./node_modules/string_decoder/**/*");
    expect(includes).toContain("./node_modules/mammoth/node_modules/nested/**/*");
  });
  it("includes installed native optionals but tolerates other platforms absent", () => {
    const root = fixture();
    manifest(root, "pdf-parse", { optionalDependencies: { "native-here": "1", "native-other": "1" } });
    manifest(root, "native-here");
    expect(parserTraceIncludes(root)).toContain("./node_modules/native-here/**/*");
    expect(parserTraceIncludes(root).some(value => value.includes("native-other"))).toBe(false);
  });
  it("fails the build rather than silently omit a required runtime dependency", () => {
    const root = fixture();
    manifest(root, "pdf-parse", { dependencies: { "missing-required": "1" } });
    expect(() => parserTraceIncludes(root)).toThrow("Missing parser runtime dependency");
  });
  it("deduplicates cycles", () => {
    const root = fixture();
    manifest(root, "mammoth", { dependencies: { yauzl: "1" } });
    manifest(root, "yauzl", { dependencies: { mammoth: "1" } });
    const includes = parserTraceIncludes(root);
    expect(includes.filter(value => value === "./node_modules/mammoth/**/*")).toHaveLength(1);
  });
});
