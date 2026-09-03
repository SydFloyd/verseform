import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = window as typeof window & { __referenceNetworkCalls?: number };
    tracked.__referenceNetworkCalls = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      tracked.__referenceNetworkCalls = (tracked.__referenceNetworkCalls ?? 0) + 1;
      return originalFetch(...args);
    };
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("distinguishes valid, fuzzy, ranged, and invalid references without network detection", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await page.evaluate(() => {
    const tracked = window as typeof window & { __providerRequests?: number };
    tracked.__providerRequests = 0;
    window.addEventListener("verseform:fake-provider-request", () => {
      tracked.__providerRequests = (tracked.__providerRequests ?? 0) + 1;
    });
  });
  await editor.click();
  await page.keyboard.type("Gensis 1:1. John 3:35-37; 1 Cor 13:4-7 ");

  const valid = page.locator(".scripture-reference");
  const invalid = page.locator(".scripture-reference-invalid");
  await expect(valid).toHaveCount(2);
  await expect(invalid).toHaveCount(1);
  await expect(valid.first()).toHaveText("Gensis 1:1");
  await expect(valid.nth(1)).toHaveText("1 Cor 13:4-7");
  await expect(invalid).toHaveText("John 3:35-37");
  await expect(invalid).toHaveAttribute("data-reference-kind", "invalid");
  expect(await page.evaluate(() => (window as typeof window & { __referenceNetworkCalls?: number }).__referenceNetworkCalls)).toBe(0);
  expect(await page.evaluate(() => (window as typeof window & { __providerRequests?: number }).__providerRequests)).toBe(0);

  await invalid.hover();
  const warning = page.getByRole("tooltip");
  await expect(warning).toContainText("John 3 ends at verse 36");
  await expect(warning).toContainText("Nothing will be inserted");
  await invalid.click();
  await expect(editor).toContainText("John 3:35-37");
  await expect(page.locator(".scripture-citation")).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { __providerRequests?: number }).__providerRequests)).toBe(0);

  await valid.nth(1).hover();
  await expect(warning).toContainText("DBS test verse 4 for 1CO");
  await valid.nth(1).click();
  await expect(editor).toContainText("DBS test verse 4 for 1CO");
  await expect(page.locator(".scripture-citation")).toHaveText("(1 Corinthians 13:4-7, NASB)");
  await expect(page.locator(".scripture-reference")).toHaveCount(1);
  expect(await page.evaluate(() => (window as typeof window & { __providerRequests?: number }).__providerRequests)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as typeof window & { __referenceNetworkCalls?: number }).__referenceNetworkCalls)).toBe(0);
});

test("keeps previews inside the viewport and supports keyboard insertion", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 620 });
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  for (let index = 0; index < 18; index += 1) {
    await page.keyboard.type(`Paragraph ${index + 1}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("John 3:16 ");

  const reference = page.locator(".scripture-reference");
  await reference.scrollIntoViewIfNeeded();
  await reference.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("DBS test verse 16 for JHN");
  const box = await tooltip.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(901);
  expect(box!.y + box!.height).toBeLessThanOrEqual(621);

  await reference.focus();
  await reference.press("Enter");
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, NASB)");
  await expect(page.locator(".scripture-reference")).toHaveCount(0);
});
