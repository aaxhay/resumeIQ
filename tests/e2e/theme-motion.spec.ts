import { expect, test } from "@playwright/test";
import { COLOR_THEME_KEY } from "../../src/lib/color-theme";
import { syntheticResume } from "../fixtures/pdf";

const toggleName = "Toggle dark theme";

test("theme follows the OS, then preserves a keyboard-selected preference across navigation and reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: toggleName });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(key => localStorage.getItem(key), COLOR_THEME_KEY)).toBe("dark");
  await page.getByRole("link", { name: "Review My Resume", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set up your resume review." })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByRole("button", { name: toggleName })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("dark theme remains usable when browser preference storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", { value: () => { throw new DOMException("Blocked", "SecurityError"); } });
    Object.defineProperty(Storage.prototype, "setItem", { value: () => { throw new DOMException("Blocked", "SecurityError"); } });
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: toggleName }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: toggleName }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("dark mobile setup preserves confirmed text across theme changes", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/review");
  await page.getByRole("radio", { name: "Paste resume text", exact: true }).check();
  await page.getByRole("textbox", { name: "1. Paste your resume text" }).fill(syntheticResume);
  await page.getByRole("button", { name: "Prepare pasted text", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Editable resume text", exact: true });
  await expect(editor).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: "Confirm resume text", exact: true }).click();
  for (const pressed of ["false", "true"]) {
    await page.getByRole("button", { name: toggleName }).click();
    await expect(page.getByRole("button", { name: toggleName })).toHaveAttribute("aria-pressed", pressed);
    await expect(editor).toHaveValue(syntheticResume);
    await expect(page.getByRole("heading", { name: "Resume text confirmed", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.screenshot({ path: testInfo.outputPath("dark-confirmed-mobile.png"), fullPage: true });
});

test("reduced motion disables decorative animation and dark layouts fit phone and desktop", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".hero-panel")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".hero-orb")).toHaveCSS("animation-name", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`dark-landing-${width}.png`), fullPage: true });
  }
  await page.goto("/account");
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("both themes retain readable semantic text and a full-sized theme control", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  for (const mode of ["light", "dark"]) {
    if (mode === "dark") await page.getByRole("button", { name: toggleName }).click();
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (token: string) => {
        const raw = style.getPropertyValue(token).trim().slice(1);
        // CSS optimization can shorten #ffffff to #fff.
        const hex = raw.length === 3 ? [...raw].map(character => character.repeat(2)).join("") : raw;
        const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
          .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
        return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
      };
      return [
        ["--foreground", "--background"], ["--muted-foreground", "--card"],
        ["--muted-foreground", "--muted"], ["--primary", "--accent"],
        ["--primary-foreground", "--primary"], ["--primary-foreground", "--primary-hover"],
        ["--destructive", "--card"],
      ].map(([foreground, background]) => {
        const a = luminance(foreground!), b = luminance(background!);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    const target = await page.getByRole("button", { name: toggleName }).boundingBox();
    expect(target?.width).toBeGreaterThanOrEqual(44);
    expect(target?.height).toBeGreaterThanOrEqual(44);
  }
});

test("theme choice synchronizes across tabs without reloading", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const second = await context.newPage();
  await second.emulateMedia({ colorScheme: "light" });
  await second.goto("/review");
  await page.getByRole("button", { name: toggleName }).click();
  await expect(second.getByRole("button", { name: toggleName })).toHaveAttribute("aria-pressed", "true");
  await second.getByRole("button", { name: toggleName }).click();
  await expect(page.getByRole("button", { name: toggleName })).toHaveAttribute("aria-pressed", "false");
  await second.close();
});

test("motion is bounded and pointer-capable desktop gets a real 3D hover transform", async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".hero-panel")).toHaveCSS("animation-iteration-count", "1");
  await expect(page.locator(".hero-orb")).toHaveCSS("animation-iteration-count", "1");
  if (!isMobile) {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Wait for the bounded entry animation, not an arbitrary sleep.
    await page.locator(".hero-panel").evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished));
    });
    await page.locator(".hero-panel").hover();
    await expect(page.locator(".hero-panel")).toHaveCSS("transform", /matrix3d/);
  }
});
