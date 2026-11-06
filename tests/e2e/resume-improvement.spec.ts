import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extractRawText } from "mammoth";
import { DOCX_CONTENT_TYPE, EXPORT_FILENAME } from "../../src/lib/resume-export/contracts";
import { reviewRequestSchema, type AiReview, type ReviewRequest } from "../../src/lib/ai-review/contracts";
import { prepareAiText } from "../../src/lib/ai-review/privacy";
import { aiQuote, aiResume, validAiReview } from "../fixtures/ai-review";
import { dashboardJob, dashboardJobMatches, dashboardResponse } from "../fixtures/dashboard";
import { syntheticDocx } from "../fixtures/docx";
import { syntheticPdf } from "../fixtures/pdf";

const safeOriginal = "Successfully Built accessible tools with automated tests for fictional teams.";
const safeRevised = "Built accessible tools with automated tests for fictional teams.";
const manualOriginal = "Documented development practices and supported peer reviews.";
const manualRevised = "Supported peer reviews and documented development practices.";
const rejectedOriginal = "Created a guide that enabled independent onboarding.";
const rejectedRevision = "Enabled independent onboarding by creating a guide.";
const canonical = (text: string) => text.split(/\r?\n/u).map(line => line.trim().replace(/^[-*•]\s+/u, "")).filter(Boolean).join("\n");
async function downloadText(page: Page, stayOnCompletion = false) {
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download DOCX", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(EXPORT_FILENAME);
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  if (!path) throw new Error("Expected local synthetic download");
  const text = (await extractRawText({ buffer: await readFile(path) })).value;
  await expect(page).toHaveURL(/\/review#download-complete$/u);
  await expect(page.getByRole("heading", { name: "Your DOCX download has started" })).toBeFocused();
  await expect(workspace(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  if (!stayOnCompletion) {
    await page.getByRole("button", { name: "Return to review", exact: true }).press("Enter");
    await expect(page).toHaveURL(/\/review$/u);
    await expect(workspace(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  }
  return text;
}
// Extend the shared synthetic resume, keeping its citations and every factual qualifier.
const extendedResume = aiResume.replace("EXPERIENCE\n", `EXPERIENCE\n${safeOriginal}\n${manualOriginal}\n`);
const workspace = (page: Page) => page.getByTestId("resume-improvement");
const card = (page: Page, id: string) => workspace(page).getByTestId(`suggestion-${id}`);
const preview = (page: Page) => workspace(page).getByRole("textbox", { name: "Improved resume preview", exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "Editable resume text", exact: true });
const send = (page: Page) => page.getByRole("button", { name: "Send previews to Gemini", exact: true });
const accept = (item: Locator) => item.getByRole("button", { name: "Accept suggestion", exact: true });
const summary = (scope: Locator, name: string) => scope.locator("summary").filter({ hasText: name });
type Finding = AiReview["findings"][number];
type Mode = ReviewRequest["mode"];

function finding(id: string, original: string, revised?: string): Finding {
  return {
    id, area: "experience", impact: "low", issue: `Review ${id} wording`,
    whyItMatters: "Clear wording helps readers interpret the supplied work.",
    recommendation: "Preserve factual meaning and add details only if true.",
    resumeEvidence: [original],
    suggestedRewrite: revised === undefined ? null : { original, revised },
  };
}
const defaultFindings = () => [
  finding("safe", safeOriginal, safeRevised),
  finding("manual", manualOriginal),
  finding("reject", rejectedOriginal),
];

async function mockReviews(page: Page, findings = defaultFindings()) {
  const requests: ReviewRequest[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // Intercept only the review API. Upload bytes go through the real extraction endpoint.
  // Every provider fixture passes the production semantic validator and job analyzer.
  await page.route("**/api/reviews", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { configured: true, personalDataEnabled: false } });
      return;
    }
    const body = reviewRequestSchema.parse(route.request().postDataJSON());
    const response = dashboardResponse(body, {
      ...validAiReview(), findings,
      jobMatches: body.mode === "job-specific" ? dashboardJobMatches(safeOriginal) : [],
    });
    requests.push(body);
    await route.fulfill({ json: response });
  });
  return { requests, errors };
}

async function uploadAndConfirm(page: Page, text = extendedResume, kind: "pdf" | "docx" = "docx") {
  await expect(page.getByLabel("Choose resume file")).toBeEnabled();
  await page.getByLabel("Choose resume file").setInputFiles({
    name: `synthetic-improvement.${kind}`,
    mimeType: kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: kind === "pdf" ? await syntheticPdf(text) : await syntheticDocx(text),
  });
  const extracted = page.waitForResponse(response => response.url().includes("/api/resume/extract") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Extract resume text", exact: true }).click();
  expect((await extracted).status()).toBe(200);
  await expect(editor(page)).toBeVisible({ timeout: 25_000 });
  const original = await editor(page).inputValue();
  for (const quote of [aiQuote, safeOriginal, manualOriginal, rejectedOriginal]) expect(original).toContain(quote);
  await page.getByRole("button", { name: "Confirm resume text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Resume preview to send", exact: true })).toHaveValue(prepareAiText(original));
  return original;
}

async function consentAndReview(page: Page) {
  await page.getByRole("checkbox", { name: /These documents are synthetic/ }).check();
  await page.getByRole("checkbox", { name: /I consent to transferring these previews to Google/ }).check();
  await send(page).click();
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
}

async function openWorkspace(page: Page) {
  const button = page.getByRole("button", { name: "Improve this resume", exact: true });
  await button.focus();
  await button.press("Enter");
  await expect(workspace(page)).toBeFocused();
}

async function start(page: Page, options: { mode?: Mode; text?: string; findings?: Finding[]; providerOnly?: string; kind?: "pdf" | "docx"; fromLanding?: boolean; preferencesAfterConfirmation?: boolean } = {}) {
  const observed = await mockReviews(page, options.findings);
  await page.goto(options.fromLanding ? "/" : "/review");
  if (options.fromLanding) await page.getByRole("link", { name: "Review My Resume", exact: true }).click();
  await expect(page.getByText("Text extraction is ready.", { exact: true })).toHaveCount(0);
  if (options.mode === "job-specific" && !options.preferencesAfterConfirmation) {
    await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
    await page.getByRole("textbox", { name: "3. Add the job description" }).fill(dashboardJob);
  }
  const original = await uploadAndConfirm(page, options.text, options.kind);
  if (options.preferencesAfterConfirmation) {
    await page.getByRole("radio", { name: options.mode === "job-specific" ? "Job-Specific Review" : "General Review", exact: true }).check();
    if (options.mode === "job-specific") {
      await page.getByRole("textbox", { name: "3. Add the job description" }).fill(dashboardJob);
      await expect(page.getByRole("heading", { name: "Resume text confirmed", exact: true })).toHaveCount(0);
      // Changing preferences intentionally requires reconfirmation, not re-extraction.
      await page.getByRole("button", { name: "Confirm resume text", exact: true }).click();
    }
  }
  expect(observed.requests).toHaveLength(0);
  if (options.providerOnly) await page.getByRole("textbox", { name: "Resume preview to send", exact: true }).fill(`${prepareAiText(original)}\n${options.providerOnly}`);
  await consentAndReview(page);
  await openWorkspace(page);
  await expect(preview(page)).toHaveValue(original);
  expect(observed.requests).toHaveLength(1);
  return { ...observed, original };
}

async function saveManual(page: Page, id: string, text: string) {
  const item = card(page, id);
  const edit = item.getByRole("button", { name: "Edit wording", exact: true });
  await edit.focus();
  await edit.press("Enter");
  const input = item.getByRole("textbox", { name: "Edit suggested text", exact: true });
  await expect(input).toBeFocused();
  await expect(accept(item)).toBeDisabled();
  await input.fill(text);
  await item.getByRole("button", { name: "Save manual edit", exact: true }).press("Enter");
  await expect(edit).toBeFocused();
  await expect(item.getByTestId("suggestion-status")).toHaveText("Manually edited · not applied");
  await expect(item.getByTestId("suggested-text")).toHaveText(text);
}

async function assertOriginal(page: Page, original: string) {
  const disclosure = summary(workspace(page), "Confirmed original · unchanged");
  if (!(await disclosure.evaluate(element => element.parentElement?.hasAttribute("open")))) await disclosure.press("Enter");
  const snapshot = workspace(page).getByRole("textbox", { name: "Original resume snapshot", exact: true });
  await expect(snapshot).toHaveValue(original);
  await expect(snapshot).toHaveAttribute("readonly", "");
  await expect(preview(page)).toHaveAttribute("readonly", "");
}

for (const mode of ["general", "job-specific"] as const) {
  test(`${mode}: compare, safely accept, manually save, reject, undo and confirm restore`, async ({ page }, testInfo) => {
    const { original, requests, errors } = await start(page, { mode, kind: mode === "general" ? "pdf" : "docx", fromLanding: true, preferencesAfterConfirmation: true });
    expect(requests[0]!.mode).toBe(mode);
    if (mode === "general") expect(requests[0]).not.toHaveProperty("jobDescription");
    else {
      expect(requests[0]).toHaveProperty("jobDescription", dashboardJob);
      const comparison = page.getByRole("region", { name: "Job evidence comparison", exact: true });
      await comparison.locator("summary").filter({ hasText: "Required and preferred coverage" }).click();
      const requirement = comparison.locator("summary").filter({ hasText: "accessible tools" }).first();
      await requirement.click();
      const evidenceCard = requirement.locator("..");
      await expect(evidenceCard.getByText("Job description preview evidence · exact text", { exact: true })).toBeVisible();
      await expect(evidenceCard.getByText("- accessible tools", { exact: true })).toBeVisible();
      await expect(evidenceCard.getByText("Resume preview evidence · exact text", { exact: true })).toBeVisible();
      await expect(evidenceCard.getByText(safeOriginal, { exact: true })).toBeVisible();
    }
    const safe = card(page, "safe");
    await expect(safe.getByRole("heading", { name: "Original text", exact: true })).toBeVisible();
    await expect(safe.getByRole("heading", { name: "Original text", exact: true }).locator("..").getByText(safeOriginal, { exact: true })).toBeVisible();
    await expect(safe.getByTestId("suggested-text")).toHaveText(safeRevised);
    const evidence = summary(safe, "Evidence reference");
    await evidence.press("Enter");
    await expect(safe.locator("blockquote")).toHaveText(safeOriginal);
    await evidence.press("Space");
    await expect(safe.locator("blockquote")).toBeHidden();
    await assertOriginal(page, original);
    await expect(workspace(page).getByRole("button", { name: "Undo latest accepted edit" })).toBeDisabled();

    await accept(safe).press("Enter");
    const aiDraft = original.replace(safeOriginal, safeRevised);
    await expect(preview(page)).toHaveValue(aiDraft);
    await expect(safe.getByTestId("suggestion-status")).toHaveText("Accepted");
    await expect(accept(safe)).toBeDisabled();
    await saveManual(page, "manual", manualRevised);
    await expect(preview(page)).toHaveValue(aiDraft); // Saving alone never applies a patch.
    await accept(card(page, "manual")).press("Space");
    const combined = aiDraft.replace(manualOriginal, manualRevised);
    await expect(preview(page)).toHaveValue(combined); // Two nonoverlapping edits in EXPERIENCE.
    await saveManual(page, "reject", rejectedRevision);
    await card(page, "reject").getByRole("button", { name: "Reject suggestion" }).press("Enter");
    await expect(card(page, "reject").getByTestId("suggestion-status")).toHaveText("Rejected");
    await expect(card(page, "reject").getByRole("button", { name: "Edit wording" })).toBeDisabled();
    await expect(preview(page)).toHaveValue(combined);
    const downloaded = await downloadText(page); // Real server generation and extraction, not an export mock.
    expect(canonical(downloaded)).toBe(canonical(combined));
    expect(downloaded).toContain(safeRevised);
    expect(downloaded).toContain(manualRevised);
    expect(downloaded).toContain(rejectedOriginal);
    expect(downloaded).not.toContain(rejectedRevision);
    expect(downloaded).not.toContain(safeOriginal);
    await expect(editor(page)).toHaveValue(original);
    expect(requests).toHaveLength(1); // Export makes no extra AI call.
    const history = summary(workspace(page), "Accepted-edit history (2)");
    await history.press("Enter");
    await expect(history.locator("..")).toContainText("user-authored wording");
    await expect(history.locator("..")).toContainText("AI wording");

    if (mode === "general") {
      for (const [label, width] of [["desktop", 1280], ["mobile", 320]] as const) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        await workspace(page).screenshot({ path: testInfo.outputPath(`resume-improvement-${label}.png`) });
      }
    }
    await workspace(page).getByRole("button", { name: "Undo latest accepted edit" }).press("Enter");
    await expect(preview(page)).toHaveValue(aiDraft);
    await expect(card(page, "manual").getByTestId("suggestion-status")).toHaveText("Manually edited · not applied");
    await expect(card(page, "manual").getByTestId("suggested-text")).toHaveText(manualRevised);
    await expect(card(page, "reject").getByTestId("suggestion-status")).toHaveText("Rejected");
    await accept(card(page, "manual")).click();
    await workspace(page).getByRole("button", { name: "Restore original content" }).click();
    const confirmation = workspace(page).getByRole("group", { name: "Confirm restore original" });
    await expect(confirmation).toBeVisible();
    await expect(preview(page)).toHaveValue(combined);
    await confirmation.getByRole("button", { name: "Keep accepted edits" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(preview(page)).toHaveValue(combined);
    await workspace(page).getByRole("button", { name: "Restore original content" }).click();
    await confirmation.getByRole("button", { name: "Confirm restore", exact: true }).press("Enter");
    await expect(preview(page)).toHaveValue(original);
    await expect(safe.getByTestId("suggestion-status")).toHaveText("Pending");
    await expect(card(page, "manual").getByTestId("suggestion-status")).toHaveText("Manually edited · not applied");
    await expect(card(page, "reject").getByTestId("suggestion-status")).toHaveText("Rejected");
    await expect(summary(workspace(page), "Accepted-edit history (0)")).toBeVisible();
    await expect(workspace(page).getByRole("button", { name: "Undo latest accepted edit" })).toBeDisabled();
    await expect(workspace(page).getByRole("button", { name: "Restore original content" })).toBeDisabled();
    await assertOriginal(page, original);
    await expect(editor(page)).toHaveValue(original);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

test("download completion preserves local work through back, forward and return, and confirms reset", async ({ page }, testInfo) => {
  const { original, requests, errors } = await start(page);
  const persistenceRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/review-history")) persistenceRequests.push(request.method()); });
  await accept(card(page, "safe")).click();
  await saveManual(page, "manual", manualRevised);
  await card(page, "reject").getByRole("button", { name: "Edit wording" }).click();
  const buffer = card(page, "reject").getByRole("textbox", { name: "Edit suggested text" });
  await buffer.fill("An unsaved local wording buffer");
  const expected = original.replace(safeOriginal, safeRevised);
  expect(canonical(await downloadText(page, true))).toBe(canonical(expected));
  const completion = page.getByTestId("download-completion");
  await expect(completion).toContainText("Downloading does not automatically save account history");
  const account = completion.getByRole("link", { name: "View account history (new tab)" });
  await expect(account).toHaveAttribute("href", "/account");
  await expect(account).toHaveAttribute("target", "_blank");
  await expect(account).toHaveAttribute("rel", "noopener noreferrer");
  for (const [label, width] of [["desktop", 1280], ["mobile", 320]] as const) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await completion.screenshot({ path: testInfo.outputPath(`download-completion-${label}.png`) });
  }
  await page.goBack();
  await expect(completion).toHaveCount(0);
  await expect(preview(page)).toHaveValue(expected);
  await expect(buffer).toHaveValue("An unsaved local wording buffer");
  await page.goForward();
  await expect(completion).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await completion.getByRole("button", { name: "Start another review", exact: true }).press("Enter");
  const reset = completion.getByRole("group", { name: "Confirm another review" });
  await expect(reset.getByRole("button", { name: "Discard local draft and start another review" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await reset.getByRole("button", { name: "Keep this review" }).press("Enter");
  await expect(reset).toHaveCount(0);
  await completion.getByRole("button", { name: "Return to review", exact: true }).press("Enter");
  await expect(preview(page)).toHaveValue(expected);
  await expect(buffer).toHaveValue("An unsaved local wording buffer");
  await expect(card(page, "manual").getByTestId("suggested-text")).toHaveText(manualRevised);
  await expect(page.getByRole("checkbox", { name: /I consent to transferring these previews to Google/ })).toBeChecked();
  await assertOriginal(page, original);
  expect(canonical(await downloadText(page, true))).toBe(canonical(expected));
  await completion.getByRole("button", { name: "Start another review", exact: true }).click();
  await reset.getByRole("button", { name: "Discard local draft and start another review" }).press("Enter");
  await expect(page).toHaveURL(/\/review$/u);
  await expect(workspace(page)).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId("ai-review-results")).toHaveCount(0);
  await expect(page.getByLabel("Choose resume file")).toBeFocused();
  expect(persistenceRequests).toEqual([]);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("browser Back warns before leaving a review entered from the landing page", async ({ page }) => {
  const { original } = await start(page, { fromLanding: true });
  await accept(card(page, "safe")).click();
  await card(page, "manual").getByRole("button", { name: "Edit wording" }).click();
  const buffer = card(page, "manual").getByRole("textbox", { name: "Edit suggested text" });
  await buffer.fill("Unsaved browser Back regression wording");
  const prompt = page.waitForEvent("dialog", { timeout: 3_000 });
  // Trigger the browser history action without waiting for a load we will cancel.
  await page.evaluate(() => window.history.back());
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page).toHaveURL(/\/review$/u);
  await expect(preview(page)).toHaveValue(original.replace(safeOriginal, safeRevised));
  await expect(buffer).toHaveValue("Unsaved browser Back regression wording");
  page.once("dialog", dialog => { void dialog.accept(); });
  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);
});

test("same-tab navigation warns before discarding accepted edits and unsaved wording", async ({ page }) => {
  const { original } = await start(page);
  await accept(card(page, "safe")).click();
  await card(page, "manual").getByRole("button", { name: "Edit wording" }).click();
  const buffer = card(page, "manual").getByRole("textbox", { name: "Edit suggested text" });
  await buffer.fill("Unsaved navigation regression wording");
  for (const name of ["ResumeIQ home", "Back to overview", "About your privacy", "How this preview handles your data"]) {
    const prompt = page.waitForEvent("dialog", { timeout: 3_000 });
    const navigation = page.getByRole("link", { name, exact: true }).click({ noWaitAfter: true });
    const dialog = await prompt;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    await navigation;
    await expect(page).toHaveURL(/\/review$/u);
    await expect(preview(page)).toHaveValue(original.replace(safeOriginal, safeRevised));
    await expect(buffer).toHaveValue("Unsaved navigation regression wording");
  }
  page.once("dialog", dialog => { void dialog.accept(); });
  await page.getByRole("link", { name: "Back to overview", exact: true }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.getByRole("link", { name: "Review My Resume", exact: true }).click();
  await expect(workspace(page)).toHaveCount(0);
});

test("a fresh completion fragment cannot fabricate a successful download", async ({ page }) => {
  await page.goto("/review#download-complete");
  await expect(page.getByTestId("download-completion")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Extract resume text", exact: true })).toBeVisible();
  await expect(workspace(page)).toHaveCount(0);
});

test("duplicate evidence requires an explicit occurrence and edits only the chosen location", async ({ page }) => {
  const { original, requests, errors } = await start(page, { text: `${extendedResume}\n${safeOriginal}` });
  const item = card(page, "safe");
  const selector = item.getByLabel("Choose intended occurrence");
  await expect(selector).toHaveValue("");
  await expect(accept(item)).toBeDisabled();
  await expect(item).toContainText("Choose an exact occurrence");
  await expect(selector.locator("option")).toHaveCount(3);
  const chosenStart = original.lastIndexOf(safeOriginal);
  expect(chosenStart).toBeGreaterThan(original.indexOf(safeOriginal));
  await selector.selectOption(String(chosenStart));
  await expect(item).toContainText(`characters ${chosenStart + 1}–${chosenStart + safeOriginal.length}`);
  await accept(item).click();
  await expect(selector).toBeDisabled();
  const expected = original.slice(0, chosenStart) + safeRevised + original.slice(chosenStart + safeOriginal.length);
  await expect(preview(page)).toHaveValue(expected);
  expect((await preview(page).inputValue()).split(safeOriginal)).toHaveLength(2);
  await assertOriginal(page, original);
  await expect(editor(page)).toHaveValue(original);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("preview-only evidence is visible but cannot patch a missing original target", async ({ page }) => {
  const missing = "Successfully Published a fictional accessibility checklist.";
  const { original, requests, errors } = await start(page, {
    providerOnly: missing, findings: [...defaultFindings(), finding("missing", missing, missing.replace("Successfully ", ""))],
  });
  expect(original).not.toContain(missing);
  expect(requests[0]!.resumeText).toContain(missing);
  const item = card(page, "missing");
  await summary(item, "Evidence reference").click();
  await expect(item.locator("blockquote")).toHaveText(missing);
  await expect(item).toContainText("The exact original text is missing or redacted");
  await expect(accept(item)).toBeDisabled();
  await expect(item.getByLabel("Choose intended occurrence")).toHaveCount(0);
  await saveManual(page, "missing", "Published a fictional accessibility checklist.");
  await expect(accept(item)).toBeDisabled();
  await expect(preview(page)).toHaveValue(original);
  await item.getByRole("button", { name: "Reject suggestion" }).click();
  await expect(item.getByTestId("suggestion-status")).toHaveText("Rejected");
  await assertOriginal(page, original);
  await expect(editor(page)).toHaveValue(original);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("overlapping edits block until undo and unsafe AI shortening stays unapplied", async ({ page }) => {
  const overlap = "accessible tools with automated tests";
  const { original, requests, errors } = await start(page, { findings: [
    ...defaultFindings(), finding("overlap", overlap), finding("unsafe", aiQuote, "Built TypeScript tools"),
  ] });
  const unsafe = card(page, "unsafe");
  await expect(unsafe.getByTestId("suggested-text")).toHaveText(aiQuote);
  await expect(unsafe).toContainText("withheld");
  await expect(accept(unsafe)).toBeDisabled();
  await unsafe.getByRole("button", { name: "Edit wording" }).click();
  await unsafe.getByRole("textbox", { name: "Edit suggested text" }).fill("A temporary unsaved draft");
  await unsafe.getByRole("button", { name: "Cancel manual edit" }).press("Enter");
  await expect(unsafe.getByRole("button", { name: "Edit wording" })).toBeFocused();
  await expect(unsafe.getByTestId("suggested-text")).toHaveText(aiQuote);
  await expect(unsafe.getByTestId("suggestion-status")).toHaveText("Pending");
  await saveManual(page, "overlap", "accessible tools covered by automated tests");
  await accept(card(page, "safe")).click();
  await expect(card(page, "overlap")).toContainText("overlaps an accepted edit");
  await expect(accept(card(page, "overlap"))).toBeDisabled();
  await expect(preview(page)).toHaveValue(original.replace(safeOriginal, safeRevised));
  await workspace(page).getByRole("button", { name: "Undo latest accepted edit" }).click();
  await expect(accept(card(page, "overlap"))).toBeEnabled();
  await accept(card(page, "overlap")).click();
  await expect(preview(page)).toHaveValue(original.replace(overlap, "accessible tools covered by automated tests"));
  await expect(card(page, "safe")).toContainText("overlaps an accepted edit");
  await expect(accept(card(page, "safe"))).toBeDisabled();
  await workspace(page).getByRole("button", { name: "Undo latest accepted edit" }).click();
  await expect(preview(page)).toHaveValue(original);
  await expect(accept(card(page, "safe"))).toBeEnabled();
  await assertOriginal(page, original);
  await expect(editor(page)).toHaveValue(original);
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("export preserves contact details, special characters and empty/unknown sections without applying unaccepted drafts", async ({ page }) => {
  const special = "\nCONTACT\nfictional@example.test | +1 202 555 0199\nCUSTOM CONTRIBUTIONS\nC++ & C# <tools> — café résumé 中文 😀\nCERTIFICATIONS\n\nOTHER DETAILS\nAvailable for fictional examples.";
  const { original, requests } = await start(page, { text: extendedResume + special });
  await saveManual(page, "manual", manualRevised); // Saved, but intentionally not accepted.
  await card(page, "reject").getByRole("button", { name: "Edit wording" }).click();
  await card(page, "reject").getByRole("textbox", { name: "Edit suggested text" }).fill("UNSAVED_DRAFT_NOT_FOR_EXPORT");
  const extracted = await downloadText(page);
  expect(canonical(extracted)).toBe(canonical(original));
  expect(extracted).toContain("fictional@example.test");
  expect(extracted).toContain("C++ & C# <tools> — café résumé 中文 😀");
  expect(extracted).toContain("CERTIFICATIONS");
  expect(extracted).not.toContain(manualRevised);
  expect(extracted).not.toContain("UNSAVED_DRAFT_NOT_FOR_EXPORT");
  await expect(card(page, "reject").getByRole("textbox", { name: "Edit suggested text" })).toHaveValue("UNSAVED_DRAFT_NOT_FOR_EXPORT");
  await expect(card(page, "manual").getByTestId("suggested-text")).toHaveText(manualRevised);
  await assertOriginal(page, original);
  expect(requests).toHaveLength(1);
});

test("export handles server, network and invalid-file failures without losing the draft, then retries explicitly", async ({ page }) => {
  const { original } = await start(page);
  await accept(card(page, "safe")).click();
  const expected = original.replace(safeOriginal, safeRevised);
  let attempts = 0;
  await page.route("**/api/resume/export", async route => {
    attempts++;
    expect(route.request().postDataJSON()).toEqual({ text: expected });
    if (attempts === 1) await route.fulfill({ status: 500, json: { ok: false, error: { code: "INVALID_DOCUMENT", message: "PRIVATE_EXPORT_DETAIL" } } });
    else if (attempts === 2) await route.abort("failed");
    else if (attempts === 3) await route.fulfill({ contentType: "text/html", body: "<p>Not a document</p>" });
    else await route.fulfill({ contentType: DOCX_CONTENT_TYPE, body: "invalid archive" });
  });
  const area = page.getByRole("region", { name: "Download your improved resume", exact: true });
  const button = area.getByRole("button", { name: "Download DOCX", exact: true });
  for (let i = 0; i < 4; i++) {
    await button.click();
    await expect(area.getByRole("alert")).toBeFocused();
    await expect(area.getByRole("alert")).toContainText(i === 0 ? "failed its structure or content checks" : "could not be completed");
    await expect(page.getByText("PRIVATE_EXPORT_DETAIL")).toHaveCount(0);
    await expect(preview(page)).toHaveValue(expected);
    await expect(button).toBeEnabled();
    expect(attempts).toBe(i + 1);
    await expect(page.getByTestId("download-completion")).toHaveCount(0);
    await expect(page).toHaveURL(/\/review$/u);
  }
  await page.unroute("**/api/resume/export");
  expect(canonical(await downloadText(page))).toBe(canonical(expected));
  await expect(area.getByRole("status")).toContainText("Download requested");
  await assertOriginal(page, original);
});

test("workspace changes cancel stale export and prevent duplicate download requests", async ({ page }) => {
  const { original } = await start(page);
  const downloads: string[] = [];
  page.on("download", download => downloads.push(download.suggestedFilename()));
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/resume/export", async route => {
    requests++;
    await held;
    await route.fulfill({ contentType: DOCX_CONTENT_TYPE, body: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }).catch(() => undefined);
  });
  await page.getByRole("button", { name: "Download DOCX", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generating DOCX…", exact: true })).toBeDisabled();
  await expect.poll(() => requests).toBe(1);
  await accept(card(page, "safe")).click();
  await expect(page.getByRole("button", { name: "Download DOCX", exact: true })).toBeEnabled();
  release();
  await page.unrouteAll({ behavior: "wait" });
  expect(downloads).toEqual([]);
  await expect(page.getByTestId("download-completion")).toHaveCount(0);
  await expect(page).toHaveURL(/\/review$/u);
  const extracted = await downloadText(page);
  expect(canonical(extracted)).toBe(canonical(original.replace(safeOriginal, safeRevised)));
  expect(downloads).toEqual([EXPORT_FILENAME]);
});

test("local drafts survive preview, consent, mode and source changes until replacement is confirmed", async ({ page }) => {
  const { original, requests, errors } = await start(page);
  await accept(card(page, "safe")).click();
  await saveManual(page, "manual", manualRevised);
  await card(page, "reject").getByRole("button", { name: "Reject suggestion" }).click();
  await card(page, "manual").getByRole("button", { name: "Edit wording" }).click();
  const unsaved = "Documented development practices; supported peer reviews.";
  const buffer = card(page, "manual").getByRole("textbox", { name: "Edit suggested text" });
  await buffer.fill(unsaved);
  const retained = async () => {
    await expect(preview(page)).toHaveValue(original.replace(safeOriginal, safeRevised));
    await expect(card(page, "manual").getByTestId("suggested-text")).toHaveText(manualRevised);
    await expect(buffer).toHaveValue(unsaved);
    await expect(card(page, "reject").getByTestId("suggestion-status")).toHaveText("Rejected");
    await expect(summary(workspace(page), "Accepted-edit history (1)")).toBeVisible();
    await assertOriginal(page, original);
  };
  await page.getByRole("textbox", { name: "Resume preview to send", exact: true }).fill(`${prepareAiText(original)}\nSynthetic preview note.`);
  await expect(page.getByTestId("ai-review-results")).toHaveCount(0);
  await retained();
  await page.getByRole("checkbox", { name: /I consent to transferring these previews to Google/ }).uncheck();
  await expect(send(page)).toBeDisabled();
  await retained();
  await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
  await page.getByRole("textbox", { name: "3. Add the job description" }).fill(dashboardJob);
  await retained();
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  await expect(editor(page)).toHaveCount(0);
  await retained();
  await page.getByRole("radio", { name: "Upload a file", exact: true }).check();
  const newOriginal = await uploadAndConfirm(page, `${extendedResume}\nADDITIONAL SYNTHETIC CONTEXT\nDocumentation practices remain part of this fictional example.`);
  expect(newOriginal).not.toBe(original);
  await retained();
  expect(requests).toHaveLength(1); // Upstream invalidation and local decisions never send reviews.
  await consentAndReview(page); // A second, explicit user-authorized mocked review.
  expect(requests).toHaveLength(2);
  expect(requests[1]!.mode).toBe("job-specific");
  await page.getByRole("button", { name: "Improve this resume", exact: true }).click();
  await expect(page.getByText("Replace the current improvement workspace?", { exact: true })).toBeVisible();
  await retained();
  await page.getByRole("button", { name: "Keep current workspace", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Replace improvement workspace", exact: true })).toHaveCount(0);
  await retained();
  await page.getByRole("button", { name: "Improve this resume", exact: true }).click();
  await retained();
  await page.getByRole("button", { name: "Replace improvement workspace", exact: true }).press("Enter");
  await expect(workspace(page)).toBeFocused();
  await expect(preview(page)).toHaveValue(newOriginal);
  await expect(buffer).toHaveCount(0);
  await expect(card(page, "manual").getByTestId("suggested-text")).toHaveText(manualOriginal);
  for (const id of ["safe", "manual", "reject"]) await expect(card(page, id).getByTestId("suggestion-status")).toHaveText("Pending");
  await expect(summary(workspace(page), "Accepted-edit history (0)")).toBeVisible();
  await assertOriginal(page, newOriginal);
  await expect(editor(page)).toHaveValue(newOriginal);
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  const reset = page.getByRole("group", { name: "Confirm start over", exact: true });
  await expect(reset).toBeVisible();
  await expect(workspace(page)).toBeVisible();
  await reset.getByRole("button", { name: "Keep my work", exact: true }).click();
  await expect(workspace(page)).toBeVisible();
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await reset.getByRole("button", { name: "Clear everything and start over", exact: true }).click();
  await expect(workspace(page)).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByTestId("ai-review-results")).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(errors).toEqual([]);
});
