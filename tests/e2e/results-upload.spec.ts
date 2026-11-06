import { expect, test, type Locator, type Page } from "@playwright/test";
import { AREAS, reviewRequestSchema, type AiReview, type ReviewRequest } from "../../src/lib/ai-review/contracts";
import { prepareAiText } from "../../src/lib/ai-review/privacy";
import { dashboardJob, dashboardJobMatches, dashboardResponse } from "../fixtures/dashboard";
import { syntheticDocx } from "../fixtures/docx";
import { syntheticPdf } from "../fixtures/pdf";

const quote = "Built accessible tools with automated tests for fictional teams.";
const context = "Documented development practices and supported peer reviews.";
const uploadedResume = `SYNTHETIC CANDIDATE\nfictional@example.test\n\nEXPERIENCE\n${quote}\n${context}\n\nSKILLS\nTesting, documentation, accessible tools`;
const minimizedResume = `EXPERIENCE\n${quote}\n${context}`;
const explicitJob = `Job title: Synthetic Developer\nCompany: Fictional Workshop\n${dashboardJob}`;
const results = (page: Page) => page.getByTestId("ai-review-results");
const send = (page: Page) => page.getByRole("button", { name: "Send previews to Gemini", exact: true });
const summary = (scope: Locator, name: string) => scope.locator("summary").filter({ hasText: name });

type Success = ReturnType<typeof dashboardResponse>;
function reviewFor(body: ReviewRequest): AiReview {
  return {
    assessment: "The supplied preview describes concrete work. Its scope could be easier to interpret; no factual verification is implied.",
    priorities: ["Clarify truthful scope", "Preserve concrete work", "Keep wording focused"].map((title) => ({ title, recommendation: "Review the original wording and add context only if true.", resumeEvidence: [quote] })),
    strengths: [{ title: "Concrete development work", explanation: "The preview identifies accessible tools and automated tests.", resumeEvidence: [quote] }],
    areas: AREAS.map((area) => ({ area, status: area === "summary" || area === "projects" ? "not_assessed" : "assessed", explanation: "Assessment is limited to the supplied preview, not the original visual layout." })),
    findings: [
      { id: "scope", area: "experience", impact: "medium", issue: "Clarify the audience if known", whyItMatters: "Context can help readers understand the work.", recommendation: "Keep the exact statement and add truthful context only if relevant.", resumeEvidence: [quote], suggestedRewrite: null },
      { id: "shortening", area: "clarity", impact: "low", issue: "Consider a shorter opening", whyItMatters: "A shorter excerpt may be easier to scan but may lose context.", recommendation: "Check that the shortened excerpt preserves the intended meaning.", resumeEvidence: [quote], suggestedRewrite: { original: quote, revised: "Built accessible tools with automated tests" } },
      { id: "impact", area: "achievements", impact: "low", issue: "Explain an outcome only if known", whyItMatters: "A supported outcome can help explain why this work mattered.", recommendation: "Do not invent an outcome or add an unsupported metric.", resumeEvidence: [context], suggestedRewrite: null },
    ],
    jobMatches: body.mode === "job-specific" ? dashboardJobMatches(quote) : [],
    limitations: ["Synthetic provider fixture; no live model call or factual verification.", "No score, ATS guarantee, or hiring decision is provided."],
  };
}

async function openAllDetails(scope: Locator) {
  // Activate native summaries in document order, including nested priority cards.
  // Never force-open DOM properties: this also exercises the public disclosure UI.
  for (const item of await scope.locator("details > summary").all()) {
    if (!(await item.evaluate((element) => element.parentElement?.hasAttribute("open")))) await item.click();
  }
}

async function keyboardToggle(page: Page, item: Locator, key: "Enter" | "Space", open: boolean) {
  await item.focus();
  await expect(item).toBeFocused();
  await page.keyboard.press(key);
  if (open) await expect(item.locator("..")).toHaveAttribute("open", "");
  else await expect(item.locator("..")).not.toHaveAttribute("open", "");
}

async function assertExactEvidence(page: Page, body: ReviewRequest, response: Success) {
  const resumeQuotes = [...response.data.priorities, ...response.data.strengths, ...response.data.findings].flatMap((item) => item.resumeEvidence);
  for (const finding of response.data.findings) {
    if (finding.suggestedRewrite) {
      expect(finding.suggestedRewrite.original).toContain(finding.suggestedRewrite.revised);
      resumeQuotes.push(finding.suggestedRewrite.original, finding.suggestedRewrite.revised);
    }
  }
  const jobQuotes: string[] = [];
  for (const item of response.data.jobMatches) {
    resumeQuotes.push(...item.resumeEvidence);
    jobQuotes.push(item.jobEvidence);
    expect(item.jobEvidence).toContain(item.requirement);
    if (item.status === "partially_supported") expect(item.resumeEvidence.length).toBeGreaterThan(0);
  }
  if (response.jobAnalysis) {
    for (const item of response.jobAnalysis.comparisons) {
      resumeQuotes.push(...item.resumeEvidence);
      jobQuotes.push(item.jobEvidence);
    }
    for (const item of response.jobAnalysis.profile.requirements) jobQuotes.push(item.evidence.text);
    for (const field of [response.jobAnalysis.profile.title, response.jobAnalysis.profile.company]) if (field) jobQuotes.push(field.evidence.text);
  }
  for (const evidence of resumeQuotes) expect(body.resumeText).toContain(evidence);
  for (const evidence of jobQuotes) expect(body.mode === "job-specific" ? body.jobDescription : "").toContain(evidence);
  await openAllDetails(results(page));
  const rendered = await results(page).locator("blockquote").allTextContents();
  expect(rendered.length).toBeGreaterThan(0);
  const returned = new Set([...resumeQuotes, ...jobQuotes]);
  for (const evidence of rendered) {
    expect(returned.has(evidence), `Rendered quote must be returned evidence: ${evidence}`).toBe(true);
    expect(body.resumeText.includes(evidence) || (body.mode === "job-specific" && body.jobDescription.includes(evidence))).toBe(true);
  }
  // Every returned citation is reachable through the disclosures, not silently dropped.
  for (const evidence of returned) expect(rendered).toContain(evidence);
  await expect(results(page).getByRole("progressbar")).toHaveCount(0);
  await expect(results(page).getByRole("meter")).toHaveCount(0);
}

for (const scenario of [{ kind: "pdf", mode: "general" }, { kind: "docx", mode: "job-specific" }] as const) {
  test(`real ${scenario.kind} upload to ${scenario.mode} evidence dashboard`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: ReviewRequest[] = [];
    const responses: Success[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    // This is the ONLY intercepted endpoint: document bytes use the actual extraction API.
    await page.route("**/api/reviews", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: { configured: true, personalDataEnabled: false } });
        return;
      }
      const body = reviewRequestSchema.parse(route.request().postDataJSON());
      const response = dashboardResponse(body, reviewFor(body));
      requests.push(body);
      responses.push(response);
      await gate;
      await route.fulfill({ json: response });
    });
    await page.goto("/review");
    await page.getByLabel("Choose resume file").setInputFiles({ name: `synthetic-dashboard.${scenario.kind}`, mimeType: scenario.kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: scenario.kind === "pdf" ? await syntheticPdf(uploadedResume) : await syntheticDocx(uploadedResume) });
    if (scenario.mode === "job-specific") {
      await page.getByRole("radio", { name: "Job-Specific Review", exact: true }).check();
      await page.getByRole("textbox", { name: "3. Add the job description" }).fill(explicitJob);
    }
    const extracted = page.waitForResponse((response) => response.url().includes("/api/resume/extract") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Extract resume text", exact: true }).click();
    expect((await extracted).status()).toBe(200);
    const editor = page.getByRole("textbox", { name: "Editable resume text" });
    await expect(editor).toBeVisible({ timeout: 25_000 });
    const confirmed = await editor.inputValue();
    expect(confirmed).toContain(quote);
    expect(confirmed).toContain("fictional@example.test");
    await expect(send(page)).toHaveCount(0);
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "Confirm resume text" }).click();
    const preview = page.getByRole("textbox", { name: "Resume preview to send", exact: true });
    await expect(preview).toHaveValue(prepareAiText(confirmed));
    await preview.fill(minimizedResume);
    await expect(send(page)).toBeDisabled();
    await page.getByRole("checkbox", { name: /These documents are synthetic/ }).check();
    await expect(send(page)).toBeDisabled();
    await page.getByRole("checkbox", { name: /I consent to transferring these previews to Google/ }).check();
    await send(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Preparing your review" })).toBeVisible();
    await expect(results(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Requesting Gemini review…" })).toBeDisabled();
    await expect.poll(() => requests.length).toBe(1);
    release();
    await expect(results(page)).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "Preparing your review" })).toHaveCount(0);
    const body = requests[0]!;
    const response = responses[0]!;
    expect(body.resumeText).toBe(minimizedResume);
    expect(JSON.stringify(body)).not.toContain("fictional@example.test");
    expect(JSON.stringify(body)).not.toContain("SYNTHETIC CANDIDATE");
    await expect(editor).toHaveValue(confirmed);
    await expect(results(page).getByRole("heading", { name: "Overall assessment", exact: true })).toBeVisible();
    const overview = summary(results(page), "Overview");
    await keyboardToggle(page, overview, "Enter", false);
    await expect(results(page).getByRole("heading", { name: "Overall assessment", exact: true })).toBeHidden();
    await keyboardToggle(page, overview, "Space", true);
    const coverage = summary(results(page), "Coverage areas");
    await keyboardToggle(page, coverage, "Enter", true);
    await expect(coverage.locator("..").getByRole("listitem")).toHaveCount(AREAS.length);
    await expect(coverage.locator("..")).toContainText("summary · Not assessed");
    await keyboardToggle(page, coverage, "Space", false);
    for (const title of ["Content", "Writing and grammar", "Structure and formatting", "Achievements and impact", "Skills"]) await expect(results(page).getByRole("heading", { name: title, exact: true })).toBeVisible();
    const shortening = summary(results(page), "Consider a shorter opening");
    await expect(shortening.locator("..").getByRole("heading", { name: "Optional extractive rewrite · not applied" })).toBeHidden();
    await keyboardToggle(page, shortening, "Enter", true);
    await expect(shortening.locator("..").getByRole("heading", { name: "Optional extractive rewrite · not applied" })).toBeVisible();
    await expect(shortening.locator("..").getByText("Why it matters", { exact: true })).toBeVisible();
    await expect(shortening.locator("..").getByText("Recommended action", { exact: true })).toBeVisible();
    if (scenario.mode === "general") {
      expect(response.jobAnalysis).toBeNull();
      expect(response.data.jobMatches).toEqual([]);
      expect(body).not.toHaveProperty("jobDescription");
      await expect(results(page).getByRole("heading", { name: "Job evidence comparison" })).toHaveCount(0);
      await expect(results(page).getByLabel("Filter comparison status")).toHaveCount(0);
    } else {
      expect(body.mode === "job-specific" && body.jobDescription).toBe(explicitJob);
      const analysis = response.jobAnalysis!;
      expect(analysis.profile.title?.value).toBe("Synthetic Developer");
      expect(analysis.profile.company?.value).toBe("Fictional Workshop");
      const jobSection = results(page).getByRole("region", { name: "Job evidence comparison" });
      await expect(jobSection.getByText("Synthetic Developer", { exact: true })).toBeVisible();
      await expect(jobSection.getByText("Fictional Workshop", { exact: true })).toBeVisible();
      const requiredCoverage = summary(jobSection, "Required and preferred coverage");
      await keyboardToggle(page, requiredCoverage, "Enter", true);
      const coverageItems = requiredCoverage.locator("..").getByRole("listitem");
      const coverageCount = analysis.comparisons.filter((item) => item.category === "required_skill" || item.category === "preferred_skill").length;
      await expect(coverageItems).toHaveCount(coverageCount);
      await expect(requiredCoverage.locator("..").getByRole("heading", { name: "Required skills", exact: true })).toBeVisible();
      await expect(requiredCoverage.locator("..").getByRole("heading", { name: "Preferred skills", exact: true })).toBeVisible();
      for (const status of ["supported", "partially_supported", "not_evidenced", "not_assessed"] as const) {
        await jobSection.getByLabel("Filter comparison status").selectOption(status);
        const comparisons = jobSection.locator("details").filter({ has: page.locator("summary", { hasText: /AI judgment|Unassessed extraction/ }) });
        const matching = analysis.comparisons.filter((item) => item.status === status);
        expect(matching.length).toBeGreaterThan(0);
        await expect(comparisons).toHaveCount(matching.length);
        for (const item of matching) await expect(comparisons.filter({ hasText: item.requirement }).first()).toBeVisible();
        // Filtering must not change the complete required/preferred coverage lists.
        await expect(coverageItems).toHaveCount(coverageCount);
      }
      expect(analysis.comparisons.some((item) => item.source === "unassessed-extraction" && item.status === "not_assessed" && item.requirement.includes("Document development practices"))).toBe(true);
      await jobSection.getByLabel("Filter comparison status").selectOption("all");
      await keyboardToggle(page, requiredCoverage, "Space", false);
    }
    await assertExactEvidence(page, body, response);
    if (scenario.mode === "job-specific") {
      // Removing explicit metadata must not leave stale title/company facts behind.
      const jobPreview = page.getByRole("textbox", { name: "Job description preview to send" });
      await jobPreview.fill(dashboardJob);
      await expect(results(page)).toHaveCount(0);
      await send(page).click();
      await expect(results(page)).toBeVisible();
      expect(requests).toHaveLength(2);
      expect(responses[1]!.jobAnalysis!.profile.title).toBeNull();
      expect(responses[1]!.jobAnalysis!.profile.company).toBeNull();
      await expect(results(page).getByText("Unknown — not explicitly identified", { exact: true })).toHaveCount(2);
      await expect(results(page).getByText("Synthetic Developer", { exact: true })).toHaveCount(0);
      await expect(results(page).getByText("Fictional Workshop", { exact: true })).toHaveCount(0);
      await assertExactEvidence(page, requests[1]!, responses[1]!);
    }
    await expect(editor).toHaveValue(confirmed);
    await expect(preview).toHaveValue(minimizedResume);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByRole("heading", { name: "Gemini review complete", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${scenario.kind}-${scenario.mode}-dashboard-320.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}
