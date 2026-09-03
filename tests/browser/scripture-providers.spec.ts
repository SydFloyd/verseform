import { expect, test } from "@playwright/test";
import { expectTranslation, scriptureTranslation, selectScriptureTranslation } from "./menu-helpers";

async function reset(page: import("@playwright/test").Page, url = "/") {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("selects and remembers a DBS translation, caches its chapter, and preserves attribution", async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = window as typeof window & { __dbsNetworkRequests?: number };
    tracked.__dbsNetworkRequests = 0;
    window.addEventListener("verseform:dbs-network-request", () => {
      tracked.__dbsNetworkRequests = (tracked.__dbsNetworkRequests ?? 0) + 1;
    });
  });
  await reset(page);
  const translation = scriptureTranslation(page);
  await expectTranslation(page, "ENGNASB");
  await translation.click();
  await expect(page.getByRole("listbox", { name: "Available translations" }).getByRole("option")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await selectScriptureTranslation(page, "ENGTEST");
  await expect(page.getByRole("status")).toContainText("DBS Test Bible selected");

  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  await page.locator(".scripture-reference").hover();
  await expect(page.getByRole("tooltip")).toContainText("DBS test verse 16 for JHN");
  await expect(page.getByRole("tooltip")).toContainText("DBS Test Bible");
  await page.locator(".scripture-reference").click();
  const citation = page.locator(".scripture-citation");
  await expect(citation).toHaveText("(John 3:16, TEST)");
  await expect(citation).toHaveAttribute("data-translation", "ENGTEST");
  await expect(citation).toHaveAttribute("data-attribution", /DBS test fixture/);
  expect(await page.evaluate(() => (window as typeof window & { __dbsNetworkRequests?: number }).__dbsNetworkRequests)).toBe(1);

  await page.keyboard.press("Control+p");
  await expect(page.frameLocator('iframe[title="Print/PDF preview"]').locator("body"))
    .toContainText("DBS test fixture — not production scripture.");

  await page.reload();
  await expectTranslation(page, "ENGTEST");
});

test("starts in explicit bundled WEB mode when the DBS catalog is offline", async ({ page }) => {
  await reset(page, "/?dbs=offline");
  await expect(page.getByText("Offline · WEB", { exact: true })).toBeVisible();
  const translation = scriptureTranslation(page);
  await expectTranslation(page, "WEB");
  await translation.click();
  await expect(page.getByRole("listbox", { name: "Available translations" }).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");

  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  await expect(editor).toContainText("only born Son");
});

test("a failed DBS passage visibly falls back and can only insert as WEB", async ({ page }) => {
  await reset(page, "/?dbs=chapter-failure");
  const translation = scriptureTranslation(page);
  await selectScriptureTranslation(page, "ENGTEST");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  const reference = page.locator(".scripture-reference");
  await reference.hover();
  await expect(page.getByRole("tooltip")).toContainText("Using bundled WEB because DBS Test Bible is unavailable");
  await expectTranslation(page, "WEB");
  await reference.click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  await expect(page.locator('[data-translation="ENGTEST"]')).toHaveCount(0);

  await page.reload();
  await expectTranslation(page, "ENGTEST");
});

test("cancels an abandoned DBS preview without changing the document", async ({ page }) => {
  await reset(page, "/?lookupDelay=350");
  await selectScriptureTranslation(page, "ENGTEST");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  await page.locator(".scripture-reference").hover();
  await page.getByRole("navigation", { name: "Application and scripture controls" }).hover();
  await page.waitForTimeout(450);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(editor).toHaveText("John 3:16 ");
  await expect(page.locator(".scripture-citation")).toHaveCount(0);
});
