import { expect, test } from "@playwright/test";

test("landing page is honest, responsive, and navigates to setup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/ResumeIQ/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("stronger resume");
  await expect(page.getByRole("heading", { name: "General Review", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job-Specific Review", exact: true })).toBeVisible();
  await expect(page.getByText(/AI feedback and export are not available yet/)).toBeVisible();
  await page.getByRole("link", { name: "See how it works" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await page.getByRole("link", { name: "Review My Resume" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Set up your resume review.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test("keyboard users can skip directly to content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("unknown routes return a real 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
});

test("landing and review layouts fit narrow phones and tablets", async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/", "/review"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
  }
});
