import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const PARSER_PACKAGES = ["pdf-parse", "mammoth", "yauzl", "htmlparser2", "fast-xml-parser", "zod", "server-only"] as const;

/** The spawned Node process cannot use Next's bundled modules. Include its installed
 * runtime dependency closure, including platform-native optional packages and assets.
 * Resolve from each parent to preserve npm's nested dependency versions. Build-time only.
 */
export function parserTraceIncludes(root: string): string[] {
  const visited = new Set<string>();
  function visit(name: string, parent: string, optional = false): void {
    const resolver = createRequire(path.join(parent, "package.json"));
    // A dependency can share a builtin name (e.g. string_decoder); ask for
    // ordinary package search paths rather than the builtin's null paths.
    const directory = resolver.resolve.paths("__resumeiq_dependency_lookup__")?.map(base => path.join(base, name))
      .find(candidate => existsSync(path.join(candidate, "package.json")));
    if (!directory) {
      if (optional) return;
      throw new Error(`Missing parser runtime dependency: ${name}`);
    }
    const relative = path.relative(root, directory).replaceAll("\\", "/");
    if (!relative.startsWith("node_modules/")) throw new Error("Parser dependencies must be installed inside the project.");
    if (visited.has(relative)) return;
    visited.add(relative);
    const manifest: unknown = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
    if (typeof manifest !== "object" || manifest === null) throw new Error("Invalid dependency manifest.");
    const dependencies = "dependencies" in manifest ? manifest.dependencies : {};
    const optionals = "optionalDependencies" in manifest ? manifest.optionalDependencies : {};
    const keys = (value: unknown): string[] => typeof value === "object" && value !== null ? Object.keys(value) : [];
    const optionalNames = new Set(keys(optionals));
    for (const dependency of new Set([...keys(dependencies), ...optionalNames])) {
      visit(dependency, directory, optionalNames.has(dependency));
    }
  }
  for (const name of PARSER_PACKAGES) visit(name, root);
  return [
    "./package.json",
    "./src/server/resume-processing/**/*.ts",
    "./src/lib/resume/**/*.ts",
    ...[...visited].sort().map(directory => `./${directory}/**/*`),
  ];
}
