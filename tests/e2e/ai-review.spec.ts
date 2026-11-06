import { expect, test, type Page, type Route } from "@playwright/test";
import { AREAS, reviewRequestSchema, reviewResponseSchema, type ReviewRequest } from "../../src/lib/ai-review/contracts";
import { prepareAiText } from "../../src/lib/ai-review/privacy";

const resume = "Fictional Person\nfictional@example.test | https://example.test | +1 202 555 0199\n\nEXPERIENCE\nBuilt accessible tools with automated tests for fictional teams.\nDocumented development practices and supported peer reviews.";
const preview = "EXPERIENCE\nBuilt accessible tools with automated tests for fictional teams.\nDocumented development practices and supported peer reviews.";
const quote = "Built accessible tools with automated tests for fictional teams.";
const job = "A fictional role building accessible tools and automated tests. Contact fictional@example.test for synthetic details.";
const jobPreview = "A fictional role building accessible tools and automated tests. Collaborate with a fictional development team.";
const success = reviewResponseSchema.parse({
  ok: true, model: "gemini-synthetic-test", redacted: false,
  data: {
    assessment: "Synthetic assessment: <img src=x onerror=alert(1)> is displayed as text, never HTML.",
    priorities: ["Clarify context", "Inspect wording", "Keep evidence"].map((title) => ({ title, recommendation: "Consider a clearer presentation without adding facts.", resumeEvidence: [quote] })),
    strengths: [{ title: "Concrete work", explanation: "The preview describes development work.", resumeEvidence: [quote] }],
    areas: AREAS.map((area) => ({ area, status: area === "summary" ? "not_assessed" : "assessed", explanation: "Limited synthetic review of this preview only." })),
    findings: [{ id: "clarify-context", area: "clarity", impact: "low", issue: "Consider a shorter sentence.", whyItMatters: "Short wording may help readability.", recommendation: "Inspect this optional extractive wording.", resumeEvidence: [quote], suggestedRewrite: { original: quote, revised: "Built accessible tools with automated tests." } }],
    jobMatches: [], limitations: ["This synthetic fixture is not factual verification."],
  },
});
if (!success.ok) throw new Error("Expected success fixture");
const jobSuccess = reviewResponseSchema.parse({ ...success, data: { ...success.data, jobMatches: (["supported", "partially_supported", "not_evidenced", "not_assessed"] as const).map((status) => ({ category: "required_skill", requirement: `Accessible development (${status})`, jobEvidence: "A fictional role building accessible tools and automated tests.", status, resumeEvidence: status === "supported" ? [quote] : [], explanation: "Only supplied preview evidence is considered.", recommendation: "Add supporting evidence only if it is true." })) } });

const send = (page: Page) => page.getByRole("button", { name: "Send previews to Gemini", exact: true });
const consent = (page: Page) => page.getByRole("checkbox", { name: /I consent to transferring these previews to Google/ });
const synthetic = (page: Page) => page.getByRole("checkbox", { name: /These documents are synthetic/ });
const results = (page: Page) => page.getByTestId("ai-review-results");
const resumeInput = (page: Page) => page.getByRole("textbox", { name: "Resume preview to send", exact: true });

type MockOptions = { availability?: unknown; availabilityStatus?: number; post?: (route: Route, body: ReviewRequest) => Promise<void> };
async function mockReviews(page: Page, options: MockOptions = {}) {
  const requests: ReviewRequest[] = [];
  await page.route("**/api/reviews", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: options.availabilityStatus ?? 200, json: options.availability ?? { configured: true, personalDataEnabled: false } });
      return;
    }
    const body = reviewRequestSchema.parse(route.request().postDataJSON());
    requests.push(body);
    if (options.post) await options.post(route, body);
    else await route.fulfill({ json: body.mode === "general" ? success : jobSuccess });
  });
  return requests;
}
async function prepare(page: Page, mode: "general" | "job-specific" = "general", confirm = true) {
  await page.goto("/review");
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  await page.getByRole("textbox", { name: "1. Paste your resume text" }).fill(resume);
  if (mode === "job-specific") {
    await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
    await page.getByRole("textbox", { name: "3. Add the job description" }).fill(job);
  }
  // Real application extraction/preparation endpoint, never mocked here.
  const extracted = page.waitForResponse((response) => response.url().includes("/api/resume/extract") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  expect((await extracted).status()).toBe(200);
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toBeVisible();
  if (confirm) await page.getByRole("button", { name: "Confirm resume text" }).click();
}
async function authorize(page: Page) {
  await synthetic(page).check();
  await consent(page).check();
  await expect(send(page)).toBeEnabled();
}

test("explicit general review sends only edited previews and renders escaped evidence without applying rewrites", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await mockReviews(page);
  await prepare(page, "general", false);
  await expect(send(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(resumeInput(page)).toHaveValue(prepareAiText(resume));
  await expect(resumeInput(page)).toContainText("Fictional Person");
  await expect(consent(page)).not.toBeChecked();
  await expect(synthetic(page)).not.toBeChecked();
  await expect(send(page)).toBeDisabled();
  expect(requests).toHaveLength(0);
  await expect(page.getByText(/Best-effort redaction is not anonymity/)).toBeVisible();
  await expect(page.getByRole("link", { name: /official Google AI Studio terms/ })).toHaveAttribute("href", "https://aistudio.google.com/docs/terms");
  await resumeInput(page).fill(preview);
  await consent(page).focus();
  await page.keyboard.press("Space");
  await expect(consent(page)).toBeChecked();
  await expect(send(page)).toBeDisabled();
  await synthetic(page).check();
  await send(page).click();
  await expect(results(page)).toBeFocused();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ mode: "general", resumeText: preview, confirmed: true, consent: true, synthetic: true });
  expect(requests[0]).not.toHaveProperty("jobDescription");
  expect(JSON.stringify(requests[0])).not.toContain("fictional@example.test");
  await expect(results(page).getByText(/Response model: gemini-synthetic-test/)).toBeVisible();
  await expect(results(page).getByRole("region", { name: "Three priorities" }).getByRole("listitem")).toHaveCount(3);
  await expect(results(page).getByRole("heading", { name: "Coverage areas" })).toBeVisible();
  await expect(results(page).getByRole("heading", { name: "Strengths", exact: true })).toBeVisible();
  await expect(results(page).getByRole("heading", { name: "Optional extractive rewrite · not applied" })).toBeVisible();
  await expect(results(page).getByText(success.data.assessment)).toBeVisible();
  await expect(results(page).locator("img")).toHaveCount(0);
  await expect(results(page).getByText(/semantic claims may still be wrong/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveValue(resume);
  await expect(send(page)).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.getByRole("heading", { name: "Gemini AI review", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("gemini-privacy-mobile.png") });
  await page.getByRole("heading", { name: "Gemini review complete", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("gemini-review-mobile.png") });
  expect(errors).toEqual([]);
  await resumeInput(page).fill(`${preview}\nUser-reviewed additional synthetic context.`);
  await expect(results(page)).toHaveCount(0);
  await expect(send(page)).toBeEnabled();
});

test("job-specific review uses both minimized previews and labels evidence without asserting absent skills", async ({ page }) => {
  const requests = await mockReviews(page);
  await prepare(page, "job-specific");
  const jd = page.getByRole("textbox", { name: "Job description preview to send" });
  await expect(jd).toHaveValue(prepareAiText(job));
  await resumeInput(page).fill(preview);
  await jd.fill(jobPreview);
  await authorize(page);
  await send(page).click();
  await expect(results(page)).toBeVisible();
  expect(requests[0]).toMatchObject({ mode: "job-specific", resumeText: preview, jobDescription: jobPreview });
  for (const status of ["Supported", "Partially supported", "Not evidenced", "Not assessed"]) await expect(results(page).getByText(status, { exact: true }).first()).toBeVisible();
  await expect(results(page).getByText(/not that you lack the skill/)).toBeVisible();
  await expect(results(page).getByText("Job description preview evidence").first()).toBeVisible();
  await jd.fill(`${jobPreview} Updated scope.`);
  await expect(results(page)).toHaveCount(0);
  await send(page).click();
  await expect(results(page)).toBeVisible();
  await page.getByRole("textbox", { name: "3. Add the job description" }).fill(`${job} Upstream change.`);
  await expect(results(page)).toHaveCount(0);
  await expect(resumeInput(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm resume text" }).click();
  await expect(consent(page)).not.toBeChecked();
  await expect(synthetic(page)).not.toBeChecked();
});

for (const scenario of ["unconfigured", "invalid", "failed"] as const) {
  test(`availability ${scenario} fails closed without blocking local checks`, async ({ page }) => {
    const options: MockOptions = { availability: scenario === "unconfigured" ? { configured: false, personalDataEnabled: true } : { configured: true }, availabilityStatus: scenario === "failed" ? 503 : 200 };
    const requests = await mockReviews(page, options);
    await prepare(page);
    await consent(page).check();
    await synthetic(page).check();
    await expect(send(page)).toBeDisabled();
    await page.getByRole("button", { name: "Run text checks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Text checks complete", exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
    if (scenario !== "unconfigured") {
      await expect(page.getByText(/Gemini availability could not be verified/)).toBeVisible();
      options.availability = { configured: true, personalDataEnabled: false };
      options.availabilityStatus = 200;
      await page.getByRole("button", { name: "Retry availability check" }).click();
      await expect(send(page)).toBeEnabled();
    }
  });
}

test("operator personal-data setting never implies a paid tier and still requires consent", async ({ page }) => {
  const requests = await mockReviews(page, { availability: { configured: true, personalDataEnabled: true } });
  await prepare(page);
  await expect(page.getByText(/not detection or verification of a paid tier/)).toBeVisible();
  await expect(send(page)).toBeDisabled();
  await expect(synthetic(page)).not.toBeChecked();
  await consent(page).check();
  await send(page).click();
  await expect(results(page)).toBeVisible();
  expect(requests[0]?.synthetic).toBe(false);
  await consent(page).uncheck();
  await expect(results(page)).toHaveCount(0);
  await expect(send(page)).toBeDisabled();
});

test("loading prevents duplicates, cancel aborts waiting, and late responses cannot restore feedback", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requests = await mockReviews(page, { post: async (route) => { await gate; await route.fulfill({ json: success }).catch(() => undefined); } });
  await prepare(page);
  await authorize(page);
  await send(page).click();
  await expect(page.getByRole("button", { name: "Requesting Gemini review…" })).toBeDisabled();
  // Even a second programmatic form submission cannot create a duplicate POST.
  await page.getByRole("form", { name: "Gemini review consent and previews" }).evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect.poll(() => requests.length).toBe(1);
  await page.getByRole("button", { name: "Cancel Gemini review" }).click();
  await expect(send(page)).toBeFocused();
  await expect(page.getByText("Request cancelled in this browser. The server may still complete the request and bill for it.")).toBeVisible();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(results(page)).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await expect(resumeInput(page)).toHaveValue(prepareAiText(resume));
});

for (const mutation of ["preview", "consent", "upstream"] as const) {
  test(`${mutation} change invalidates an in-flight response`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const requests = await mockReviews(page, { post: async (route) => { await gate; await route.fulfill({ json: success }).catch(() => undefined); } });
    await prepare(page);
    await authorize(page);
    await send(page).click();
    await expect.poll(() => requests.length).toBe(1);
    if (mutation === "preview") await resumeInput(page).fill(preview);
    else if (mutation === "consent") await consent(page).uncheck();
    else await page.getByRole("textbox", { name: "Editable resume text" }).fill(`${resume}\nUpstream correction.`);
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(results(page)).toHaveCount(0);
    if (mutation === "upstream") await expect(send(page)).toHaveCount(0);
    else await expect(page.getByRole("button", { name: "Cancel Gemini review" })).toHaveCount(0);
  });
}

test("validation sends nothing, malformed response is rejected, and explicit retries use new IDs", async ({ page }) => {
  let attempt = 0;
  const requests = await mockReviews(page, { post: async (route) => {
    attempt++;
    if (attempt === 1) await route.fulfill({ json: { ...success, data: { ...success.data, priorities: [] } } });
    else if (attempt === 2) await route.fulfill({ status: 502, json: { ok: false, error: { code: "PROVIDER_ERROR", message: "Do not render raw upstream content", retryable: true } } });
    else await route.fulfill({ json: success });
  } });
  await prepare(page);
  await authorize(page);
  await resumeInput(page).fill("short");
  await send(page).click();
  await expect(resumeInput(page)).toBeFocused();
  await expect(page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert")).toContainText("No AI request was sent");
  expect(requests).toHaveLength(0);
  await resumeInput(page).fill(preview);
  await send(page).click();
  await expect(page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert")).toContainText("response could not be validated");
  await expect(page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert")).toBeFocused();
  await expect(results(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Retry Gemini review", exact: true }).click();
  await expect(page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert")).toContainText("Gemini could not complete this review");
  await expect(page.getByText("Do not render raw upstream content")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry Gemini review", exact: true }).click();
  await expect(results(page)).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(new Set(requests.map((request) => request.requestId)).size).toBe(3);
});
