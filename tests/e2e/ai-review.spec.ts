import { expect, test, type Page, type Route } from "@playwright/test";
import { AREAS, reviewRequestSchema, type AiReview, type ReviewRequest } from "../../src/lib/ai-review/contracts";
import { prepareAiText } from "../../src/lib/ai-review/privacy";
import { dashboardJob, dashboardJobMatches, dashboardResponse } from "../fixtures/dashboard";

const resume = "Fictional Person\nfictional@example.test | https://example.test | +1 202 555 0199\n\nEXPERIENCE\nBuilt accessible tools with automated tests for fictional teams.\nDocumented development practices and supported peer reviews.";
const preview = "EXPERIENCE\nBuilt accessible tools with automated tests for fictional teams.\nDocumented development practices and supported peer reviews.";
const quote = "Built accessible tools with automated tests for fictional teams.";
const job = "A fictional role building accessible tools and automated tests. Contact fictional@example.test for synthetic details.";
const jobPreview = dashboardJob;
const review: AiReview = {
    assessment: "Synthetic assessment: <img src=x onerror=alert('synthetic')> is displayed as text, never HTML.",
    priorities: ["Clarify context", "Inspect wording", "Keep evidence"].map((title) => ({ title, recommendation: "Consider a clearer presentation without adding facts.", resumeEvidence: [quote] })),
    strengths: [{ title: "Concrete work", explanation: "The preview describes development work.", resumeEvidence: [quote] }],
    areas: AREAS.map((area) => ({ area, status: area === "summary" ? "not_assessed" : "assessed", explanation: "Limited synthetic review of this preview only." })),
    findings: [{ id: "clarify-context", area: "clarity", impact: "low", issue: "Consider a shorter sentence.", whyItMatters: "Short wording may help readability.", recommendation: "Inspect this optional extractive wording.", resumeEvidence: [quote], suggestedRewrite: { original: quote, revised: "Built accessible tools with automated tests" } }],
    jobMatches: [], limitations: ["This synthetic fixture is not factual verification."],
};
const success = (body: ReviewRequest) => dashboardResponse(body, { ...review, jobMatches: body.mode === "job-specific" ? dashboardJobMatches(quote) : [] });

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
    else await route.fulfill({ json: success(body) });
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
  const priorities = results(page).locator("section").filter({ has: page.getByRole("heading", { name: "Three priorities", exact: true }) });
  await expect(priorities.getByRole("listitem")).toHaveCount(3);
  await expect(results(page).getByText("Coverage areas", { exact: true })).toBeVisible();
  await expect(results(page).getByRole("heading", { name: "Strengths", exact: true })).toBeVisible();
  await expect(results(page).getByRole("heading", { name: "Optional extractive rewrite · not applied" })).toBeHidden();
  await results(page).locator("summary").filter({ hasText: "Consider a shorter sentence." }).click();
  await expect(results(page).getByRole("heading", { name: "Optional extractive rewrite · not applied" })).toBeVisible();
  await expect(results(page).getByText(review.assessment)).toBeVisible();
  await expect(results(page).locator("img")).toHaveCount(0);
  const limitations = results(page).locator("summary").filter({ hasText: /^Review limitations$/ });
  await limitations.click();
  await expect(limitations.locator("..").getByText(/semantic claims may still be wrong/)).toBeVisible();
  await expect(results(page).getByRole("heading", { name: "Job evidence comparison" })).toHaveCount(0);
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
  const comparison = results(page).getByRole("region", { name: "Job evidence comparison" });
  for (const status of ["Supported", "Partially supported", "Not evidenced", "Not assessed"]) {
    await expect(comparison.locator("summary").filter({ hasText: `${status} · AI judgment` }).first()).toBeVisible();
  }
  await expect(results(page).getByText(/not that you lack the skill/)).toBeVisible();
  const supportedRequirement = comparison.locator("summary").filter({ hasText: "accessible tools" }).first();
  await supportedRequirement.click();
  await expect(supportedRequirement.locator("..").getByText("Job description preview evidence · exact text", { exact: true })).toBeVisible();
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
  const requests = await mockReviews(page, { post: async (route, body) => { const response = success(body); await gate; await route.fulfill({ json: response }).catch(() => undefined); } });
  await prepare(page);
  await authorize(page);
  await send(page).click();
  await expect(page.getByRole("button", { name: "Requesting Gemini review…" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Preparing your review" })).toBeVisible();
  await expect(page.getByText("Waiting for the validated response. No results are available yet.")).toBeVisible();
  await expect(results(page)).toHaveCount(0);
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
    const requests = await mockReviews(page, { post: async (route, body) => { const response = success(body); await gate; await route.fulfill({ json: response }).catch(() => undefined); } });
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

test("validation failure explains its safe reason and preserves previews for an explicit retry", async ({ page }) => {
  const requests = await mockReviews(page, { post: async (route) => {
    await route.fulfill({ status: 502, json: { ok: false, error: { code: "INVALID_RESPONSE", message: "PRIVATE_PROVIDER_DETAIL", retryable: true, validationIssue: "evidence" } } });
  } });
  await prepare(page);
  await authorize(page);
  await send(page).click();
  const alert = page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert");
  await expect(alert).toBeFocused();
  await expect(alert).toContainText("missing, inconsistent, or non-matching evidence citations");
  await expect(alert).toContainText("Reason: evidence");
  await expect(page.getByText("PRIVATE_PROVIDER_DETAIL")).toHaveCount(0);
  await expect(results(page)).toHaveCount(0);
  await expect(resumeInput(page)).toHaveValue(prepareAiText(resume));
  await expect(page.getByRole("button", { name: "Retry Gemini review", exact: true })).toBeEnabled();
  expect(requests).toHaveLength(1);
});

for (const [issue, explanation] of [
  ["job_claim", "not proof that you lack a skill"],
  ["unverified_number", "do not add invented numbers to make the review pass"],
] as const) {
  test(`job-specific ${issue} preserves both previews and requires an explicit retry`, async ({ page }) => {
    let attempt = 0;
    const requests = await mockReviews(page, { post: async (route, body) => {
      attempt++;
      if (attempt === 1) await route.fulfill({ status: 502, json: { ok: false, error: { code: "INVALID_RESPONSE", message: "PRIVATE_PROVIDER_DETAIL", retryable: true, validationIssue: issue } } });
      else await route.fulfill({ json: success(body) });
    } });
    await prepare(page, "job-specific");
    await resumeInput(page).fill(preview);
    const jobInput = page.getByRole("textbox", { name: "Job description preview to send", exact: true });
    await jobInput.fill(jobPreview);
    await authorize(page);
    await send(page).click();
    const alert = page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert");
    await expect(alert).toBeFocused();
    await expect(alert).toContainText(explanation);
    await expect(alert).toContainText(`Reason: ${issue}`);
    await expect(page.getByText("PRIVATE_PROVIDER_DETAIL")).toHaveCount(0);
    await expect(results(page)).toHaveCount(0);
    await expect(resumeInput(page)).toHaveValue(preview);
    await expect(jobInput).toHaveValue(jobPreview);
    const retry = page.getByRole("button", { name: "Retry Gemini review", exact: true });
    await expect(retry).toBeEnabled();
    expect(requests).toHaveLength(1);
    await retry.click();
    await expect(results(page)).toBeFocused();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ mode: "job-specific", resumeText: preview, jobDescription: jobPreview });
    expect(requests[1]?.requestId).not.toBe(requests[0]?.requestId);
  });
}

test("timeout, rate-limit and network failures preserve previews and recover only on explicit retry", async ({ page }) => {
  let attempt = 0;
  const requests = await mockReviews(page, { post: async (route, body) => {
    attempt++;
    if (attempt <= 2) await route.fulfill({ status: attempt === 1 ? 504 : 429, json: { ok: false, error: { code: attempt === 1 ? "TIMEOUT" : "RATE_LIMIT", message: "PRIVATE_ERROR_MUST_NOT_RENDER", retryable: true } } });
    else if (attempt === 3) await route.abort("failed");
    else await route.fulfill({ json: success(body) });
  } });
  await prepare(page);
  await authorize(page);
  const originalPreview = await resumeInput(page).inputValue();
  const alert = page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert");
  for (const [index, message] of ["timed out", "limit has been reached", "could not be received"].entries()) {
    await page.getByRole("button", { name: index === 0 ? "Send previews to Gemini" : "Retry Gemini review", exact: true }).click();
    await expect(alert).toBeFocused();
    await expect(alert).toContainText(message);
    await expect(page.getByText("PRIVATE_ERROR_MUST_NOT_RENDER")).toHaveCount(0);
    await expect(results(page)).toHaveCount(0);
    await expect(resumeInput(page)).toHaveValue(originalPreview);
    expect(requests).toHaveLength(index + 1);
  }
  await page.getByRole("button", { name: "Retry Gemini review", exact: true }).click();
  await expect(results(page)).toBeVisible();
  expect(requests).toHaveLength(4);
  expect(new Set(requests.map(request => request.requestId)).size).toBe(4);
});

test("client review deadline aborts waiting and ignores a late response", async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests = await mockReviews(page, { post: async (route, body) => {
    await held;
    await route.fulfill({ json: success(body) }).catch(() => undefined);
  } });
  await prepare(page);
  await authorize(page);
  await send(page).click();
  await expect.poll(() => requests.length).toBe(1);
  await page.clock.fastForward(75_001);
  await expect(page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert")).toContainText("could not be received");
  await expect(resumeInput(page)).toHaveValue(prepareAiText(resume));
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(results(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry Gemini review", exact: true })).toBeEnabled();
  expect(requests).toHaveLength(1);
});

test("very long AI previews are rejected without sending or truncating them", async ({ page }) => {
  const requests = await mockReviews(page);
  await prepare(page);
  await authorize(page);
  const long = "Python database development and testing. ".repeat(800);
  expect(long.length).toBeGreaterThan(30_000);
  await resumeInput(page).fill(long);
  await send(page).click();
  await expect(resumeInput(page)).toBeFocused();
  await expect(resumeInput(page)).toHaveValue(long);
  await expect(page.getByRole("region", { name: "Gemini AI review", exact: true }).getByRole("alert")).toContainText("No AI request was sent");
  expect(requests).toHaveLength(0);
});

test("validation sends nothing, malformed response is rejected, and explicit retries use new IDs", async ({ page }) => {
  let attempt = 0;
  const requests = await mockReviews(page, { post: async (route, body) => {
    const response = success(body);
    attempt++;
    if (attempt === 1) await route.fulfill({ json: { ...response, data: { ...response.data, priorities: [] } } });
    else if (attempt === 2) await route.fulfill({ status: 502, json: { ok: false, error: { code: "PROVIDER_ERROR", message: "Do not render raw upstream content", retryable: true } } });
    else await route.fulfill({ json: response });
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
