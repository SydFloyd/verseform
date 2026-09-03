import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseMenuItem, expectTranslation } from "./menu-helpers";

test("keeps compact control groups visible and stable at representative Windows widths and scales", async ({ browser }, testInfo) => {
  for (const scenario of [
    { width: 1120, height: 820, deviceScaleFactor: 1 },
    { width: 960, height: 720, deviceScaleFactor: 1.25 },
    { width: 780, height: 600, deviceScaleFactor: 1.5 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      deviceScaleFactor: scenario.deviceScaleFactor,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator("h1.sr-only")).toHaveText("Verseform document editor");
    await expect(page.getByText("Verseform", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Application menus" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Scripture controls" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Typeface" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Alignment and indentation" })).toBeVisible();

    const layout = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        ".toolbar button, .toolbar select, .icon-color-control",
      ));
      const paper = document.querySelector<HTMLElement>(".paper")!;
      const formatting = document.querySelector<HTMLElement>(".formatting-toolbar")!;
      return {
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        paperTop: paper.getBoundingClientRect().top,
        paperHeight: paper.getBoundingClientRect().height,
        formatting: formatting.getBoundingClientRect().toJSON(),
        controls: controls.map((control) => control.getBoundingClientRect().toJSON()),
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.paperTop).toBeLessThan(180);
    expect(layout.paperHeight).toBeGreaterThan(490);
    for (const control of layout.controls) {
      expect(control.left).toBeGreaterThanOrEqual(0);
      expect(control.right).toBeLessThanOrEqual(layout.viewportWidth + 0.5);
      expect(control.height).toBeGreaterThanOrEqual(31.5);
    }

    const editor = page.getByRole("textbox", { name: "Document editor" });
    await editor.click();
    await page.keyboard.type("Stable writing chrome");
    const afterFormatting = await page.locator(".formatting-toolbar").evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(afterFormatting).toEqual(layout.formatting);
    const screenshot = await page.screenshot({
      path: `artifacts/vfm-100-${scenario.width}px-${scenario.deviceScaleFactor}x.png`,
      fullPage: true,
    });
    await testInfo.attach(`Verseform ${scenario.width}px at ${scenario.deviceScaleFactor}x`, {
      body: screenshot,
      contentType: "image/png",
    });
    await context.close();
  }
});

test("keeps command buttons quiet until hover or active feedback is needed", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const file = page.getByRole("button", { name: "File", exact: true });
  const bold = page.getByRole("button", { name: "Bold" });
  await expect(file).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(bold).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await file.hover();
  await expect(file).toHaveCSS("border-top-color", "rgb(112, 99, 78)");
  await bold.hover();
  await expect(bold).toHaveCSS("border-top-color", "rgb(112, 99, 78)");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await expect(bold).toHaveCSS("border-top-color", "rgb(107, 77, 47)");
});

test("shows the translation abbreviation at rest and searchable full titles when expanded", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectTranslation(page, "ENGNASB");

  const trigger = page.getByRole("button", { name: /^Scripture translation:/ });
  await expect(trigger).toHaveText("NASB");
  await expect(trigger).not.toContainText("New American Standard Bible");
  await trigger.click();

  const search = page.getByRole("combobox", { name: "Search translations" });
  await expect(search).toBeFocused();
  const translations = page.getByRole("listbox", { name: "Available translations" });
  await expect(translations.getByRole("option", { name: /NASB — New American Standard Bible/ })).toBeVisible();
  const screenshot = await page.screenshot({ path: "artifacts/vfm-100-translation-picker.png", fullPage: true });
  await testInfo.attach("Expanded translation picker", { body: screenshot, contentType: "image/png" });
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await search.fill("test bible");
  await expect(translations.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expectTranslation(page, "ENGTEST");
  await expect(trigger).toHaveText("TEST");

  await trigger.press("ArrowDown");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("opens complete local credits by pointer and keyboard, escapes provider metadata, and returns focus", async ({ page }) => {
  await page.addInitScript(() => {
    const evidence = { catalogs: 0, passages: 0, links: [] as Array<{ target: string; url: string }> };
    Object.defineProperty(window, "__creditsEvidence", { value: evidence, configurable: true });
    window.addEventListener("verseform:catalog-request", () => { evidence.catalogs += 1; });
    window.addEventListener("verseform:fake-provider-request", () => { evidence.passages += 1; });
    window.addEventListener("verseform:external-link", (event) => {
      evidence.links.push((event as CustomEvent<{ target: string; url: string }>).detail);
    });
  });
  await page.goto("/?dbs=untrusted-metadata");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectTranslation(page, "ENGNASB");

  const before = await page.evaluate(() => (
    window as unknown as { __creditsEvidence: { catalogs: number; passages: number } }
  ).__creditsEvidence);
  await chooseMenuItem(page, "Help", /^Credits & Licenses/);
  const dialog = page.getByRole("dialog", { name: "Credits & Licenses" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Credits and Licenses" })).toBeFocused();
  await expect(dialog).toContainText("Verseform 0.1.0");
  await expect(dialog).toContainText("Digital Bible Society");
  await expect(dialog).toContainText("World English Bible");
  await expect(dialog).toContainText("NASB <img data-provider-markup src=x onerror=alert(1)>");
  await expect(dialog).toContainText("<script data-provider-markup>alert('untrusted')</script>");
  await expect(dialog.locator("[data-provider-markup]")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/vfm-100-credits.png", fullPage: true });

  await dialog.getByText(/View \d+ dependency license records/).click();
  await expect(dialog.getByLabel("Third-party dependency license inventory")).toContainText("VERSEFORM DEPENDENCY LICENSE INVENTORY");
  const afterOpen = await page.evaluate(() => (
    window as unknown as { __creditsEvidence: { catalogs: number; passages: number } }
  ).__creditsEvidence);
  expect(afterOpen.catalogs).toBe(before.catalogs);
  expect(afterOpen.passages).toBe(before.passages);

  await dialog.getByRole("button", { name: /Visit Digital Bible Society/ }).click();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __creditsEvidence: { links: Array<{ target: string; url: string }> } }
  ).__creditsEvidence.links)).toEqual([
    { target: "digital-bible-society", url: "https://dbs.org/" },
  ]);
  await expect(page).toHaveURL(/dbs=untrusted-metadata/);

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help", exact: true })).toBeFocused();

  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.press("F1");
  await expect(page.getByRole("dialog", { name: "Credits & Licenses" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
});
