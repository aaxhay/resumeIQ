import { fork } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { extractionResponseSchema } from "../src/lib/resume/contracts.ts";
import type { ProcessingInput } from "../src/server/resume-processing/types.ts";
import { syntheticPdf, syntheticResume } from "../tests/fixtures/pdf.ts";
import { syntheticDocx } from "../tests/fixtures/docx.ts";

// Run after next build. A projectless directory prevents accidental fallback to
// the development node_modules/source tree. This is not a Linux/Vercel smoke test.
const root = process.cwd();
const traceFile = path.join(root, ".next/server/app/api/resume/extract/route.js.nft.json");
const trace = z.object({ files: z.array(z.string()).min(1) }).parse(JSON.parse(await readFile(traceFile, "utf8")));
const destination = await mkdtemp(path.join(os.tmpdir(), "resumeiq-worker-package-"));
let bytes = 0;
try {
  for (const entry of trace.files) {
    const source = path.resolve(path.dirname(traceFile), entry);
    const relative = path.relative(root, source);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Trace escapes project root.");
    if (relative.split(path.sep).some(part => part.startsWith(".env") || ["artifacts", "private", "secrets", "credentials"].includes(part))) {
      throw new Error("Private file found in function trace.");
    }
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    bytes += (await readFile(target)).byteLength;
  }
  for (const input of [
    { kind: "pasted", text: syntheticResume },
    { kind: "pdf", bytes: new Uint8Array(await syntheticPdf()) },
    { kind: "docx", bytes: new Uint8Array(await syntheticDocx(syntheticResume)) },
  ] satisfies ProcessingInput[]) {
    await new Promise<void>((resolve, reject) => {
      const child = fork(path.join(destination, "src/server/resume-processing/worker.ts"), [], {
        cwd: destination,
        execArgv: ["--conditions=react-server", "--max-old-space-size=192", "--disable-warning=ExperimentalWarning"],
        env: { NODE_ENV: "production", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP },
        serialization: "advanced", stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true,
      });
      let success = false;
      const timer = setTimeout(() => { child.kill("SIGKILL"); }, 20_000);
      child.once("message", (message: unknown) => {
        const result = extractionResponseSchema.safeParse(message);
        success = result.success && result.data.ok && result.data.data.source === input.kind
          && result.data.data.text.includes("SYNTHETIC CANDIDATE")
          && result.data.data.text.includes("TypeScript, React, testing, documentation");
      });
      child.once("error", () => { clearTimeout(timer); reject(new Error(`Packaged ${input.kind} worker could not launch.`)); });
      child.once("exit", code => {
        clearTimeout(timer);
        if (success && code === 0) resolve();
        else reject(new Error(`Packaged ${input.kind} extraction failed.`));
      });
      child.send(input, error => { if (error) child.kill("SIGKILL"); });
    });
    console.log(JSON.stringify({ check: `packaged-${input.kind}`, passed: true }));
  }
  console.log(JSON.stringify({ traceFiles: trace.files.length, uncompressedMiB: Math.ceil(bytes / 1024 / 1024), platform: process.platform, hostedVerification: false }));
} finally {
  await rm(destination, { recursive: true, force: true });
}
