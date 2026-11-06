import { expect, test, type Page, type Route } from "@playwright/test";
import { reviewRequestSchema, reviewSchema, type AiReview } from "../../src/lib/ai-review/contracts";
import { accountActionSchema, reviewSummary, savedAnalysisSchema, saveReviewRequestSchema, type SavedReview, type SaveReviewRequest } from "../../src/lib/saved-reviews/contracts";
import { aiQuote, aiResume, validAiReview } from "../fixtures/ai-review";
import { dashboardResponse } from "../fixtures/dashboard";

const email = "synthetic-history@example.test";
const id = "1712aa45-b1c4-4daa-a681-2ef9ee25f411";
const safeOriginal = "Successfully Built TypeScript tools for internal documentation.";
const syntheticResume = aiResume.replace(aiQuote, safeOriginal);
const review: AiReview = {
  ...validAiReview(),
  assessment: "Synthetic assessment <img src=x onerror=alert('history')> is text, not HTML.",
  findings: [{ ...validAiReview().findings[0]!, id: "safe-excerpt", resumeEvidence: [safeOriginal], suggestedRewrite: { original: safeOriginal, revised: aiQuote } }],
};
const snapshot = reviewSummary(review);
function savedReview(): SavedReview {
  return { id, review_mode: "general", resume_filename: null, analysis_result: snapshot.analysis_result, resume_suggestions: snapshot.suggestions, created_at: new Date().toISOString() };
}
function failure(code: string) { return { ok: false, error: { code, message: "RAW_PRIVATE_INTERNAL_MESSAGE_DO_NOT_RENDER" } }; }

type AccountOptions = { configured?: boolean; enabled?: boolean; setupRequired?: boolean; unavailable?: boolean; signedIn?: boolean; confirmation?: boolean; failAuth?: boolean };
async function mockAccount(page: Page, options: AccountOptions = {}) {
  const calls: { method: string; body: unknown }[] = [];
  const state = { signedIn: options.signedIn ?? false, email };
  await page.route("**/api/account", async route => {
    const method = route.request().method();
    calls.push({ method, body: method === "GET" ? null : route.request().postDataJSON() });
    if (method === "GET") {
      const setupRequired = state.signedIn && options.setupRequired;
      const unavailable = state.signedIn && options.unavailable;
      await route.fulfill({ json: { ok: true, configured: options.configured ?? true, historyEnabled: setupRequired || unavailable ? false : options.enabled ?? true, ...(setupRequired ? { historySetupRequired: true } : {}), ...(unavailable ? { historyUnavailable: true } : {}), user: state.signedIn ? { email: state.email } : null } });
      return;
    }
    const body = accountActionSchema.parse(route.request().postDataJSON());
    if (options.failAuth) { await route.fulfill({ status: 400, json: failure("AUTH_FAILED") }); return; }
    const confirmation = body.action === "sign-up" && options.confirmation;
    state.signedIn = body.action !== "sign-out" && !confirmation;
    if (body.action !== "sign-out") state.email = body.email;
    await route.fulfill({ json: { ok: true, confirmationRequired: Boolean(confirmation) } });
  });
  return { calls, state };
}
async function emptyHistory(page: Page) {
  await page.route("**/api/review-history", route => route.fulfill({ json: { ok: true, reviews: [] } }));
}
async function signIn(page: Page) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
}
async function mockAi(page: Page, input: AiReview = review) {
  const posts: unknown[] = [];
  await page.route("**/api/reviews", async route => {
    if (route.request().method() === "GET") { await route.fulfill({ json: { configured: true, personalDataEnabled: false } }); return; }
    const body = reviewRequestSchema.parse(route.request().postDataJSON());
    posts.push(body);
    await route.fulfill({ json: dashboardResponse(body, input) });
  });
  return posts;
}
async function prepareResume(page: Page) {
  await page.goto("/review");
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  await page.getByRole("textbox", { name: "1. Paste your resume text" }).fill(syntheticResume);
  // Real extraction/preparation route. Only account/history and the separate synthetic AI boundary are mocked.
  const response = page.waitForResponse(result => result.url().includes("/api/resume/extract") && result.request().method() === "POST");
  await page.getByRole("button", { name: "Prepare pasted text" }).click();
  expect((await response).status()).toBe(200);
  await page.getByRole("button", { name: "Confirm resume text", exact: true }).click();
}
async function completeAi(page: Page) {
  await prepareResume(page);
  await page.getByRole("checkbox", { name: /These documents are synthetic/ }).check();
  await page.getByRole("checkbox", { name: /I consent to transferring these previews to Google/ }).check();
  await page.getByRole("button", { name: "Send previews to Gemini", exact: true }).click();
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
}
const savePanel = (page: Page) => page.getByTestId("save-review-panel");
async function openSave(page: Page) {
  const toggle = page.locator("summary").filter({ hasText: /^Save review summary/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(savePanel(page)).toBeVisible();
}

test("anonymous local review never requests account or history and keeps its primary flow", async ({ page }) => {
  const account = await mockAccount(page);
  let historyCalls = 0;
  await page.route("**/api/review-history", async route => { historyCalls++; await route.fulfill({ json: { ok: true, reviews: [] } }); });
  const aiPosts = await mockAi(page);
  await prepareResume(page);
  await page.getByRole("button", { name: "Run text checks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Text checks complete", exact: true })).toBeVisible();
  expect(account.calls).toEqual([]);
  expect(historyCalls).toBe(0);
  expect(aiPosts).toEqual([]);
  await expect(page.getByRole("link", { name: /Account \(opens in a new tab/ })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
});

for (const scenario of ["unconfigured", "disabled"] as const) {
  test(`optional account explains ${scenario} saving without blocking reviews`, async ({ page }) => {
    await mockAccount(page, { configured: scenario !== "unconfigured", enabled: false, signedIn: scenario === "disabled" });
    let histories = 0;
    await page.route("**/api/review-history", async route => { histories++; await route.fulfill({ json: { ok: true, reviews: [] } }); });
    await page.goto("/account");
    await expect(page.getByText(scenario === "unconfigured" ? /Accounts and saving are unavailable/ : /Saving is unavailable on this deployment/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Start a review · no account needed/ })).toHaveAttribute("href", "/review");
    await expect(page.getByRole("heading", { name: "Saved review summaries" })).toHaveCount(0);
    expect(histories).toBe(0);
  });
}

test("missing history setup preserves signed-in identity and sign-out without fetching history", async ({ page }) => {
  const account = await mockAccount(page, { signedIn: true, setupRequired: true });
  let histories = 0;
  await page.route("**/api/review-history", async route => { histories++; await route.fulfill({ status: 503, json: failure("HISTORY_NOT_READY") }); });
  await page.goto("/account");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  const notice = page.getByText(/Saved history requires database setup/);
  await expect(notice).toContainText("configure retention using docs/supabase.md");
  await expect(notice).toContainText("Turning on the history flag alone does not create the tables");
  await expect(page.getByText(/Saving is unavailable on this deployment/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Saved review summaries" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh history" })).toHaveCount(0);
  expect(histories).toBe(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText(/Signed out. Private history has been cleared/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}`)).toHaveCount(0);
  expect(account.calls.filter(call => call.method === "POST").map(call => accountActionSchema.parse(call.body).action)).toEqual(["sign-out"]);
  expect(histories).toBe(0);
});

test("a temporary history outage retains account access and can be retried independently", async ({ page }, testInfo) => {
  const options = { signedIn: true, unavailable: true };
  const account = await mockAccount(page, options);
  let histories = 0;
  await page.route("**/api/review-history", async route => { histories++; await route.fulfill({ json: { ok: true, reviews: [] } }); });
  await page.goto("/account");
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByText(/Saved history is temporarily unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("history-unavailable.png"), fullPage: true });
  await expect(page.getByRole("heading", { name: "Saved review summaries" })).toHaveCount(0);
  expect(histories).toBe(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect(account.calls.filter(call => call.method === "POST").map(call => accountActionSchema.parse(call.body).action)).toEqual(["sign-out"]);
  await expect(page.getByText(/Signed out. Private history has been cleared/)).toBeVisible();
  await signIn(page);
  options.unavailable = false;
  await page.getByRole("button", { name: "Retry history availability", exact: true }).click();
  await expect(page.getByText("No saved summaries yet")).toBeVisible();
  await expect(page.getByText(/Saved history is temporarily unavailable/)).toHaveCount(0);
});

test("signup validates a 12-character password, requires confirmation, then allows sign-in", async ({ page }) => {
  const account = await mockAccount(page, { confirmation: true });
  await emptyHistory(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Create an account instead" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("at least 12");
  expect(account.calls.filter(call => call.method === "POST")).toEqual([]);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-only");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText(/Check your email to confirm your account/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved review summaries" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in instead" }).click();
  await signIn(page);
  await expect(page.getByText("No saved summaries yet")).toBeVisible();
  expect(account.calls.filter(call => call.method === "POST").map(call => accountActionSchema.parse(call.body).action)).toEqual(["sign-up", "sign-in"]);
});

test("failed authentication and callback use static safe copy", async ({ page }) => {
  await mockAccount(page, { failAuth: true });
  await page.goto("/account?auth=failed&message=RAW_QUERY_SECRET");
  await expect(page.getByText(/The confirmation link could not be completed/)).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/We could not complete account access/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("RAW_PRIVATE");
  await expect(page.locator("body")).not.toContainText("RAW_QUERY_SECRET");
});

test("account checks time out safely and allow an explicit retry", async ({ page }) => {
  await page.clock.install();
  let stalled = true;
  let started = false;
  await page.route("**/api/account", async route => {
    started = true;
    if (!stalled) await route.fulfill({ json: { ok: true, configured: true, historyEnabled: true, user: null } });
  });
  await page.goto("/account");
  await expect.poll(() => started).toBe(true);
  await page.clock.fastForward(20_001);
  await expect(page.getByRole("button", { name: "Retry account check" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("request could not be confirmed");
  stalled = false;
  await page.getByRole("button", { name: "Retry account check" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("failed sign-out hides private history and explains that the session may still be active", async ({ page }) => {
  const options = { signedIn: true, failAuth: true };
  await mockAccount(page, options);
  await page.route("**/api/review-history", route => route.fulfill({ json: { ok: true, reviews: [savedReview()] } }));
  await page.goto("/account");
  await expect(page.getByTestId("saved-summary")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByTestId("saved-summary")).toHaveCount(0);
  await expect(page.getByText(/Sign-out could not be confirmed/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("RAW_PRIVATE");
  options.failAuth = false;
  await page.getByRole("button", { name: "Retry account check" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText(/Signed out. Private history has been cleared/)).toBeVisible();
});

test("own history escapes text and requires explicit deletion, retaining summaries on errors", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  const stored = savedReview();
  await page.route("**/api/review-history", route => route.fulfill({ json: { ok: true, reviews: [stored] } }));
  let deletes = 0;
  await page.route(`**/api/review-history/${id}`, async route => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().postDataJSON()).toEqual({});
    deletes++;
    await route.fulfill(deletes === 1 ? { status: 503, json: failure("STORAGE_ERROR") } : { json: { ok: true } });
  });
  await page.goto("/account");
  const item = page.getByTestId("saved-summary");
  await item.locator("summary").click();
  await expect(item.getByText(review.assessment, { exact: true })).toBeVisible();
  await expect(item.locator("img")).toHaveCount(0);
  await expect(item.getByText(safeOriginal, { exact: true })).toBeVisible();
  await expect(page.getByText(/cannot restore an editing workspace/)).toBeVisible();
  await item.getByRole("button", { name: "Delete summary", exact: true }).click();
  await expect(item.getByRole("button", { name: "Confirm delete" })).toBeFocused();
  expect(deletes).toBe(0);
  await item.getByRole("button", { name: "Keep summary" }).click();
  expect(deletes).toBe(0);
  await item.getByRole("button", { name: "Delete summary", exact: true }).click();
  await item.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be updated or loaded");
  await expect(item).toBeVisible();
  await expect(page.locator("body")).not.toContainText("RAW_PRIVATE");
  await item.getByRole("button", { name: "Confirm delete" }).click();
  await expect(item).toHaveCount(0);
  await expect(page.getByText("Summary deleted from your account history.")).toBeVisible();
  expect(deletes).toBe(2);
});

test("expired sessions clear previously loaded private history and return to inline sign-in", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  let expired = false;
  await page.route("**/api/review-history", async route => {
    await route.fulfill(!expired ? { json: { ok: true, reviews: [savedReview()] } } : { status: 401, json: failure("UNAUTHORIZED") });
  });
  await page.goto("/account");
  await page.getByTestId("saved-summary").locator("summary").click();
  await expect(page.getByText(review.assessment, { exact: true })).toBeVisible();
  expired = true;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByText(/Your session has expired/)).toBeVisible();
  await expect(page.getByTestId("saved-summary")).toHaveCount(0);
  await expect(page.getByText(review.assessment, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("sign-out clears private history immediately and stale responses cannot restore it", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  let hold = false;
  let release: (() => Promise<void>) | undefined;
  await page.route("**/api/review-history", async route => {
    if (!hold) await route.fulfill({ json: { ok: true, reviews: [savedReview()] } });
    else release = async () => { await route.fulfill({ json: { ok: true, reviews: [savedReview()] } }).catch(() => {}); };
  });
  await page.goto("/account");
  await expect(page.getByTestId("saved-summary")).toHaveCount(1);
  hold = true;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText(/Signed out. Private history has been cleared/)).toBeVisible();
  await release?.();
  await expect(page.getByTestId("saved-summary")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Saved review summaries" })).toHaveCount(0);
});

test("returning from another tab revalidates the account and clears signed-out history", async ({ page }) => {
  const account = await mockAccount(page, { signedIn: true });
  await page.route("**/api/review-history", route => route.fulfill({ json: { ok: true, reviews: [savedReview()] } }));
  await page.goto("/account");
  await page.getByTestId("saved-summary").locator("summary").click();
  await expect(page.getByText(review.assessment, { exact: true })).toBeVisible();
  account.state.signedIn = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByTestId("saved-summary")).toHaveCount(0);
  await expect(page.getByText(review.assessment, { exact: true })).toHaveCount(0);
});

test("malformed history fails closed and can be retried without exposing unvalidated text", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  let malformed = true;
  await page.route("**/api/review-history", async route => {
    await route.fulfill({ json: malformed ? { ok: true, reviews: [{ analysis_result: { assessment: "UNVALIDATED_PRIVATE_TEXT" } }] } : { ok: true, reviews: [] } });
  });
  await page.goto("/account");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("request could not be confirmed");
  await expect(page.locator("body")).not.toContainText("UNVALIDATED_PRIVATE_TEXT");
  malformed = false;
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByText("No saved summaries yet")).toBeVisible();
});

test("optional inline save preserves the review and draft, previews exact data and retries idempotently", async ({ page }, testInfo) => {
  const account = await mockAccount(page);
  const aiPosts = await mockAi(page);
  const saves: SaveReviewRequest[] = [];
  let firstSave: Route | undefined;
  await page.route("**/api/review-history", async route => {
    expect(route.request().method()).toBe("POST");
    const body = saveReviewRequestSchema.parse(route.request().postDataJSON());
    saves.push(body);
    if (saves.length === 1) firstSave = route;
    else await route.fulfill({ json: { ok: true, id: body.id } });
  });
  await completeAi(page);
  expect(account.calls).toEqual([]);
  await page.getByRole("button", { name: "Improve this resume", exact: true }).click();
  const draft = page.getByRole("textbox", { name: "Improved resume preview", exact: true });
  const originalDraft = await draft.inputValue();
  await openSave(page);
  await signIn(page);
  await expect(draft).toHaveValue(originalDraft);
  await expect(page).toHaveURL(/\/review$/);
  const panel = savePanel(page);
  await expect(panel.getByRole("region", { name: "Exact summary preview" })).toContainText(review.assessment);
  await expect(panel.getByText(safeOriginal, { exact: true })).toBeVisible();
  await expect(panel.locator("img")).toHaveCount(0);
  await expect(panel.getByText(/Snippets and summary text may contain personal information/)).toBeVisible();
  const save = panel.getByRole("button", { name: "Save summary", exact: true });
  await expect(save).toBeDisabled();
  const consent = panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ });
  await consent.focus(); await page.keyboard.press("Space");
  await expect(save).toBeEnabled();
  expect(saves).toEqual([]);
  await save.click();
  await expect.poll(() => saves.length).toBe(1);
  await expect(panel.getByRole("button", { name: "Saving summary…" })).toBeDisabled();
  await firstSave!.abort("failed");
  await expect(panel.getByRole("button", { name: "Retry saving summary" })).toBeEnabled();
  await panel.getByRole("button", { name: "Retry saving summary" }).click();
  await expect(panel.getByText(/Summary saved to your account/)).toBeVisible();
  expect(saves).toHaveLength(2);
  expect(saves[0]).toEqual(saves[1]);
  expect(saves[0]).toMatchObject({ ...snapshot, consent: true, expected_account_email: email, review_mode: "general", resume_filename: null });
  expect(Object.keys(saves[0]!).sort()).toEqual(["analysis_result", "consent", "expected_account_email", "id", "resume_filename", "review_mode", "suggestions"]);
  expect(JSON.stringify(saves[0])).not.toContain(syntheticResume);
  expect(JSON.stringify(saves[0])).not.toContain("user_id");
  expect(JSON.stringify(saves[0])).not.toContain("jobDescription");
  expect(JSON.stringify(saves[0])).not.toContain("resumeEvidence");
  expect(aiPosts).toHaveLength(1);
  await expect(draft).toHaveValue(originalDraft);
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await panel.getByRole("heading", { name: "Keep a summary, not your resume" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("optional-save-mobile.png") });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("a cookie account change rejects stale consent and requires consent again", async ({ page }) => {
  const account = await mockAccount(page, { signedIn: true });
  await mockAi(page);
  const attempts: SaveReviewRequest[] = [];
  const persisted: SaveReviewRequest[] = [];
  await page.route("**/api/review-history", async route => {
    const body = saveReviewRequestSchema.parse(route.request().postDataJSON());
    attempts.push(body);
    if (body.expected_account_email !== account.state.email) {
      await route.fulfill({ status: 409, json: failure("ACCOUNT_CHANGED") });
    } else {
      persisted.push(body);
      await route.fulfill({ json: { ok: true, id: body.id } });
    }
  });
  await completeAi(page);
  await openSave(page);
  const panel = savePanel(page);
  await panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ }).check();
  // Another tab's delayed sign-in completes after this tab's last account check.
  account.state.email = "another-synthetic@example.test";
  await panel.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(panel.getByText(/Your account changed before this summary could be saved/)).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ })).toHaveCount(0);
  expect(attempts[0]?.expected_account_email).toBe(email);
  expect(persisted).toHaveLength(0);
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
  await signIn(page);
  const consent = panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ });
  await expect(consent).not.toBeChecked();
  await expect(panel.getByRole("button", { name: "Save summary", exact: true })).toBeDisabled();
  await consent.check();
  await panel.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(panel.getByText(/Summary saved to your account/)).toBeVisible();
  expect(persisted).toHaveLength(1);
  expect(attempts[1]?.id).toBe(attempts[0]?.id);
});

test("a full history explains how to make room and preserves the save for retry", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  await mockAi(page);
  let full = true;
  const attempts: SaveReviewRequest[] = [];
  await page.route("**/api/review-history", async route => {
    const body = saveReviewRequestSchema.parse(route.request().postDataJSON());
    attempts.push(body);
    await route.fulfill(full ? { status: 409, json: failure("REVIEW_LIMIT") } : { json: { ok: true, id: body.id } });
  });
  await completeAi(page);
  await openSave(page);
  const panel = savePanel(page);
  await panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ }).check();
  await panel.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("20 saved summaries");
  await expect(panel.getByRole("alert")).toContainText("delete an existing summary before retrying");
  await expect(panel.getByText(/Summary saved to your account/)).toHaveCount(0);
  full = false; // The user deleted an existing summary in Account.
  await panel.getByRole("button", { name: "Retry saving summary" }).click();
  await expect(panel.getByText(/Summary saved to your account/)).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test("an oversized valid AI summary is rejected before save consent or a network request", async ({ page }) => {
  const oversized = reviewSchema.parse({
    ...review,
    assessment: "語".repeat(1200),
    priorities: Array.from({ length: 3 }, () => ({ title: "語".repeat(500), recommendation: "語".repeat(1200), resumeEvidence: [safeOriginal] })),
    strengths: Array.from({ length: 5 }, () => ({ title: "語".repeat(500), explanation: "語".repeat(1200), resumeEvidence: [safeOriginal] })),
    limitations: Array(5).fill("語".repeat(500)),
  });
  expect(savedAnalysisSchema.safeParse(reviewSummary(oversized).analysis_result).success).toBe(false);
  await mockAccount(page, { signedIn: true });
  await mockAi(page, oversized);
  let saves = 0;
  await page.route("**/api/review-history", async route => { saves++; await route.fulfill({ status: 400, json: failure("INVALID_REQUEST") }); });
  await completeAi(page);
  await openSave(page);
  const panel = savePanel(page);
  await expect(panel.getByRole("alert")).toContainText("exceeds the saved-history size limit");
  await expect(panel.getByRole("alert")).toContainText("Retrying will not reduce its size");
  await expect(panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /Save summary|Retry saving summary/ })).toHaveCount(0);
  await expect(panel).not.toContainText("Check your connection");
  await expect(panel).not.toContainText("A save may have completed");
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
  expect(saves).toBe(0);
});

test("missing setup hides inline save controls without losing the current review or draft", async ({ page }) => {
  await mockAccount(page, { signedIn: true, setupRequired: true });
  await mockAi(page);
  let saves = 0;
  await page.route("**/api/review-history", async route => { saves++; await route.fulfill({ status: 503, json: failure("HISTORY_NOT_READY") }); });
  await completeAi(page);
  await page.getByRole("button", { name: "Improve this resume", exact: true }).click();
  const draft = page.getByRole("textbox", { name: "Improved resume preview", exact: true });
  const originalDraft = await draft.inputValue();
  await openSave(page);
  const panel = savePanel(page);
  await expect(panel.getByText(/Saved history requires database setup/)).toBeVisible();
  await expect(panel.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  await expect(panel.getByRole("button", { name: "Save summary", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ })).toHaveCount(0);
  await expect(panel.getByText(/Summary saved to your account/)).toHaveCount(0);
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
  await expect(draft).toHaveValue(originalDraft);
  expect(saves).toBe(0);
});

test("missing save RPC shows safe setup guidance without false success or lost local edits", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  const aiPosts = await mockAi(page);
  const saves: SaveReviewRequest[] = [];
  await page.route("**/api/review-history", async route => {
    expect(route.request().method()).toBe("POST");
    saves.push(saveReviewRequestSchema.parse(route.request().postDataJSON()));
    await route.fulfill({ status: 503, json: failure("HISTORY_NOT_READY") });
  });
  await completeAi(page);
  await page.getByRole("button", { name: "Improve this resume", exact: true }).click();
  const draft = page.getByRole("textbox", { name: "Improved resume preview", exact: true });
  const originalDraft = await draft.inputValue();
  await openSave(page);
  const panel = savePanel(page);
  await panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ }).check();
  await panel.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Saved history requires database setup");
  await expect(panel.getByRole("alert")).toContainText("configure retention using docs/supabase.md");
  await expect(panel.getByRole("alert")).toContainText("retrying cannot fix missing tables");
  await expect(panel).not.toContainText("RAW_PRIVATE");
  await expect(panel.getByText(/Summary saved to your account/)).toHaveCount(0);
  await expect(panel.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ })).toBeChecked();
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
  await expect(draft).toHaveValue(originalDraft);
  expect(saves).toHaveLength(1);
  await panel.getByRole("button", { name: "Retry saving summary" }).click();
  await expect(panel.getByRole("alert")).toContainText("Saved history requires database setup");
  await expect(panel.getByText(/Summary saved to your account/)).toHaveCount(0);
  expect(saves).toHaveLength(2);
  expect(saves[1]).toEqual(saves[0]);
  expect(aiPosts).toHaveLength(1);
  await expect(draft).toHaveValue(originalDraft);
});

test("a save rejected by an expired session clears save authorization without losing the current review", async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  await mockAi(page);
  let saves = 0;
  await page.route("**/api/review-history", async route => { saves++; await route.fulfill({ status: 401, json: failure("UNAUTHORIZED") }); });
  await completeAi(page);
  await openSave(page);
  const panel = savePanel(page);
  await panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ }).check();
  await panel.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(panel.getByText(/Your session has expired/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: /I consent to saving this exact summary/ })).toHaveCount(0);
  await expect(page.getByTestId("ai-review-results")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Editable resume text" })).toHaveValue(syntheticResume);
  expect(saves).toBe(1);
});

test("account controls remain labeled and keyboard-usable at 320px", async ({ page }, testInfo) => {
  await mockAccount(page);
  await emptyHistory(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/account");
  const emailField = page.getByLabel("Email", { exact: true });
  await emailField.focus();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.type("synthetic-password-only");
  await page.keyboard.press("Tab");
  const signInButton = page.getByRole("button", { name: "Sign in", exact: true });
  await expect(signInButton).toBeFocused();
  expect((await signInButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(page.getByText("No saved summaries yet")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("account-mobile.png"), fullPage: true });
});
