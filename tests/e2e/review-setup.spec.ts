import { expect, test, type Page } from "@playwright/test";
import { syntheticPdf, syntheticResume } from "../fixtures/pdf";
import { syntheticDocx } from "../fixtures/docx";

const pdfType = "application/pdf";
const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const job = "We are looking for an engineer to build accessible web applications, collaborate with designers, and write reliable automated tests.";
const ready = (page: Page) => page.getByRole("heading", { name: "Resume text confirmed", exact: true });
const upload = (page: Page) => page.getByRole("button", { name: "Extract resume text", exact: true });
const alerts = (page: Page) => page.getByRole("form", { name: "Resume review setup" }).getByRole("alert");

async function dropFiles(page: Page, names: string[]) {
  const bytes = Array.from(await syntheticPdf());
  const transfer = await page.evaluateHandle(({ fileNames, bytes }) => {
    const data = new DataTransfer();
    for (const name of fileNames) data.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
    return data;
  }, { fileNames: names, bytes });
  try { await page.getByTestId("resume-dropzone").dispatchEvent("drop", { dataTransfer: transfer }); }
  finally { await transfer.dispose(); }
}

test.beforeEach(async ({ page }) => { await page.goto("/review"); });

test("setup inputs remain disabled until their client handlers are ready", async ({ page }) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/u, async route => { await scriptsReady; await route.continue(); });
  await page.goto("/review", { waitUntil: "commit" });
  try {
    await expect(page.getByLabel("Choose resume file")).toBeDisabled();
    await expect(page.getByRole("radio", { name: "Paste resume text", exact: true })).toBeDisabled();
  } finally { releaseScripts(); }
  await expect(page.getByLabel("Choose resume file")).toBeEnabled();
  await page.getByLabel("Choose resume file").setInputFiles({ name: "hydration.pdf", mimeType: pdfType, buffer: await syntheticPdf() });
  await expect(page.getByText(/Selected locally/)).toBeVisible();
  await expect(upload(page)).toBeEnabled();
});

for (const kind of ["pdf", "docx"] as const) {
  test(`${kind}: upload, inspect, edit, confirm exact text, and start over`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.method() === "POST") requests.push(request.url()); });
    await expect(upload(page)).toBeDisabled();
    await page.getByLabel("Choose resume file").setInputFiles({ name: `resume.${kind}`, mimeType: kind === "pdf" ? pdfType : docxType, buffer: kind === "pdf" ? await syntheticPdf() : await syntheticDocx() });
    await expect(page.getByText(/Selected locally/)).toBeVisible();
    expect(requests).toEqual([]);
    await upload(page).click();
    const editor = page.getByRole("textbox", { name: "Editable resume text" });
    await expect(editor).toBeVisible({ timeout: 25_000 });
    await expect(editor).toBeFocused();
    await expect(editor).toContainText(kind === "pdf" ? "EXPERIENCE" : "Experience");
    const edited = `${await editor.inputValue()}\n\nUser-approved correction: documented additional synthetic testing responsibilities.`;
    await editor.fill(edited);
    await page.getByRole("button", { name: "Confirm resume text" }).click();
    await expect(ready(page)).toBeVisible();
    await expect(editor).toHaveValue(edited);
    await expect(page.getByText(/Confirmation does not run AI analysis/)).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/api/resume/extract");
    await page.screenshot({ path: testInfo.outputPath(`${kind}-confirmation.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await editor.fill(`${edited}\nAnother correction.`);
    await expect(ready(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(editor).toHaveCount(0);
    await expect(upload(page)).toBeDisabled();
    await expect(page.getByLabel("Choose resume file")).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("job-specific mode validates description and invalidates confirmation on preferences", async ({ page }) => {
  await page.getByLabel("Choose resume file").setInputFiles({ name: "resume.docx", mimeType: docxType, buffer: await syntheticDocx() });
  await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
  const description = page.getByRole("textbox", { name: "3. Add the job description" });
  await upload(page).click();
  await expect(description).toBeFocused();
  await expect(alerts(page)).toContainText("at least 50");
  await description.fill("a".repeat(10_001));
  await expect(alerts(page)).toContainText("10,000");
  await description.fill(job);
  // The endpoint accepts exactly one file field; extra job-description fields
  // would fail server validation. Playwright omits binary multipart postData.
  const posted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/resume/extract"));
  await upload(page).click();
  expect((await posted).status()).toBe(200);
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(ready(page)).toBeVisible();
  await description.fill(`${job} More details.`);
  await expect(ready(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await page.getByRole("radio", { name: "General Review", exact: true }).check();
  await expect(ready(page)).toHaveCount(0);
  await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
  await expect(description).toHaveValue(`${job} More details.`);
});

test("rejects invalid, empty, oversized, and disguised files and recovers", async ({ page }) => {
  const pdf = { name: "resume.pdf", mimeType: pdfType, buffer: await syntheticPdf() };
  const input = page.getByLabel("Choose resume file");
  for (const [file, message] of [
    [{ ...pdf, name: "resume.doc" }, "Choose a PDF or DOCX"],
    [{ ...pdf, buffer: Buffer.alloc(0) }, "empty or unreadable"],
    [{ ...pdf, buffer: Buffer.alloc(4 * 1024 * 1024 + 1) }, "too large"],
    [{ ...pdf, buffer: Buffer.from("not a PDF") }, "header does not match"],
    [{ ...pdf, mimeType: "image/png" }, "type does not match"],
  ] as const) {
    await input.setInputFiles(file);
    await expect(alerts(page)).toContainText(message);
    await expect(upload(page)).toBeDisabled();
  }
  await input.setInputFiles(pdf);
  await expect(alerts(page)).toHaveCount(0);
  await expect(upload(page)).toBeEnabled();
});

test("server parsing failure offers pasted text and validates user edits", async ({ page }) => {
  await page.getByLabel("Choose resume file").setInputFiles({ name: "corrupt.pdf", mimeType: pdfType, buffer: Buffer.from("%PDF-1.7 broken") });
  await upload(page).click();
  await expect(alerts(page)).toContainText("corrupted", { timeout: 25_000 });
  await page.getByRole("button", { name: "Use pasted text instead" }).click();
  const pasted = page.getByRole("textbox", { name: "1. Paste your resume text" });
  await expect(pasted).toBeFocused();
  await pasted.fill("short");
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(alerts(page)).toContainText("Too little readable text", { timeout: 25_000 });
  await pasted.fill(syntheticResume);
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  const editor = page.getByRole("textbox", { name: "Editable resume text" });
  await expect(editor).toHaveValue(syntheticResume, { timeout: 25_000 });
  await editor.fill(" ");
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(page.locator("#editor-error")).toContainText("40 characters and 8 words");
  await editor.fill("a".repeat(80_001));
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(page.locator("#editor-error")).toContainText("80,000");
  await editor.fill(syntheticResume);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(ready(page)).toBeVisible();
});

test("corrupted DOCX is rejected by the server and allows pasted-text recovery", async ({ page }) => {
  await page.getByLabel("Choose resume file").setInputFiles({ name: "corrupt.docx", mimeType: docxType, buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) });
  const response = page.waitForResponse(value => value.url().includes("/api/resume/extract") && value.request().method() === "POST");
  await upload(page).click();
  const rejected = await response;
  expect(rejected.status()).toBe(422);
  expect(await rejected.json()).toMatchObject({ ok: false, error: { code: "MALFORMED_FILE" } });
  await expect(alerts(page)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use pasted text instead" }).click();
  await page.getByRole("textbox", { name: "1. Paste your resume text" }).fill(syntheticResume);
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveValue(syntheticResume);
});

test("extraction network interruption preserves input and permits explicit retry", async ({ page }) => {
  await page.route("**/api/resume/extract", route => route.abort("failed"));
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  const pasted = page.getByRole("textbox", { name: "1. Paste your resume text" });
  await pasted.fill(syntheticResume);
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(alerts(page)).toContainText("couldn’t reach the document processor");
  await expect(pasted).toHaveValue(syntheticResume);
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveCount(0);
  await page.unroute("**/api/resume/extract");
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveValue(syntheticResume);
});

test("shows short-extraction warnings separately from resume quality", async ({ page }) => {
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  await page.getByRole("textbox", { name: "1. Paste your resume text" }).fill("A fictional engineer built tools and tested reliable software for teams.");
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(page.getByText(/This is an extraction warning, not a resume score/)).toBeVisible({ timeout: 25_000 });
});

test("supports drag and drop, rejects multiple files, and replaces the current file", async ({ page }) => {
  await dropFiles(page, ["first.pdf"]);
  await expect(page.getByText("first.pdf", { exact: true })).toBeVisible();
  await upload(page).click();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toBeVisible({ timeout: 25_000 });
  await dropFiles(page, ["first.pdf", "second.pdf"]);
  await expect(alerts(page)).toContainText("one resume at a time");
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveCount(0);
  await dropFiles(page, ["second.pdf"]);
  await expect(page.getByText("second.pdf", { exact: true })).toBeVisible();
});

test("keyboard modes and page reload do not persist resume input", async ({ page }) => {
  const general = page.getByRole("radio", { name: "General Review", exact: true });
  await general.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Job-Specific Review", exact: true })).toBeChecked();
  await page.getByRole("textbox").fill(job);
  await page.getByLabel("Choose resume file").setInputFiles({ name: "resume.pdf", mimeType: pdfType, buffer: await syntheticPdf() });
  await page.reload();
  await expect(general).toBeChecked();
  await expect(page.getByText(/Selected locally/)).toHaveCount(0);
  await expect(upload(page)).toBeDisabled();
});

test("reset ignores stale local file checks", async ({ page }) => {
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () { await new Promise<void>((resolve) => window.setTimeout(resolve, 1000)); return original.call(this); };
  });
  await page.getByLabel("Choose resume file").setInputFiles({ name: "resume.pdf", mimeType: pdfType, buffer: await syntheticPdf() });
  await expect(page.getByText("Checking size, type, and file header on your device.")).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByLabel("Choose resume file")).toBeFocused();
  await page.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 1100)));
  await expect(page.getByText(/Selected locally/)).toHaveCount(0);
});

test("cancel discards a late response without losing pasted input", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/resume/extract", async (route) => {
    await gate;
    await route.fulfill({ json: { ok: true, data: { source: "pasted", text: syntheticResume, warnings: [], stats: { characters: syntheticResume.length, words: 40 } } } }).catch(() => undefined);
  });
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  const pasted = page.getByRole("textbox", { name: "1. Paste your resume text" });
  await pasted.fill(syntheticResume);
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(page.getByRole("button", { name: "Processing resume…" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel processing" }).click();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(pasted).toHaveValue(syntheticResume);
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare pasted text" })).toBeEnabled();
});
