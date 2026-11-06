import { expect, test, type Page } from "@playwright/test";
import { repetitiveResume, strongResume } from "../fixtures/analysis-resumes";

async function prepare(page: Page, text: string) {
  await page.goto("/review");
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  await page.getByRole("textbox", { name: "1. Paste your resume text" }).fill(text);
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toBeVisible({ timeout: 25_000 });
}
const run = (page: Page) => page.getByRole("button", { name: "Run text checks", exact: true });

test("checks exact confirmed edits locally, displays evidence, and locates it in the editor", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page, repetitiveResume);
  await expect(run(page)).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "Editable resume text" });
  const edited = `${await editor.inputValue()}\n\n- Maintained the the guide.`;
  await editor.fill(edited);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(page.getByTestId("text-check-results")).toHaveCount(0);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await run(page).click();
  await expect(page.getByRole("heading", { name: "Text checks complete", exact: true })).toBeVisible();
  await expect(page.getByTestId("text-check-results")).toBeFocused();
  await expect(run(page)).toBeDisabled();
  const finding = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Adjacent word repetition", exact: true }) });
  await expect(finding.getByText("Objective observation", { exact: true })).toBeVisible();
  await finding.locator("summary").click();
  await expect(finding.locator("blockquote")).toHaveText("the the");
  await finding.getByRole("button", { name: "Inspect in editor" }).click();
  await expect(editor).toBeFocused();
  const selected = await editor.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd));
  expect(selected).toBe("the the");
  await expect(page.getByText(/This count is not a score/)).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("deterministic-findings.png"), fullPage: true });
});

test("invalidates findings on text and mode changes, requiring confirmation again", async ({ page }) => {
  await prepare(page, repetitiveResume);
  const editor = page.getByRole("textbox", { name: "Editable resume text" });
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await run(page).click();
  await expect(page.getByTestId("text-check-results")).toBeVisible();
  await editor.fill(strongResume);
  await expect(page.getByTestId("text-check-results")).toHaveCount(0);
  await expect(run(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await run(page).click();
  await expect(page.getByText(/No findings from these limited rules/)).toBeVisible();
  await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
  await expect(page.getByTestId("text-check-results")).toHaveCount(0);
  const job = page.getByRole("textbox", { name: "3. Add the job description" });
  await job.fill("A fictional role requiring clear writing, testing, accessibility, and collaborative development.");
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await run(page).click();
  await expect(page.getByText(/these local checks do not compare job descriptions/)).toBeVisible();
  await expect(page.getByText(/No findings from these limited rules/)).toBeVisible();
  await job.fill("Another fictional role requiring clear writing and reliable software development and documentation.");
  await expect(page.getByTestId("text-check-results")).toHaveCount(0);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(run(page)).toHaveCount(0);
});

test("project checks require explicit relevance and empty findings do not claim a pass", async ({ page }) => {
  await prepare(page, strongResume.split("\n\nPROJECTS")[0] ?? strongResume);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  const projects = page.getByRole("checkbox", { name: /Projects are relevant to this resume/ });
  await expect(projects).not.toBeChecked();
  await run(page).click();
  await expect(page.getByText(/This is not proof that the resume is complete/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects heading was not detected", exact: true })).toHaveCount(0);
  await projects.check();
  await expect(page.getByTestId("text-check-results")).toHaveCount(0);
  await run(page).click();
  await expect(page.getByRole("heading", { name: "Projects heading was not detected", exact: true })).toBeVisible();
  await projects.uncheck();
  await run(page).click();
  await expect(page.getByText(/No findings from these limited rules/)).toBeVisible();
});
