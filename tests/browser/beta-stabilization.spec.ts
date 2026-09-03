import { expect, test } from "@playwright/test";
import { chooseMenuItem, expectTranslation, selectScriptureTranslation } from "./menu-helpers";

declare global {
  interface Window {
    __betaPrintEvents?: number;
    __betaPdfEvents?: number;
    __betaDbsNetworkEvents?: number;
    __transitionNetworkRequests?: number;
  }
}

test("repeats complete document, scripture, print, and PDF cycles without stranded work", async ({ page }) => {
  await page.addInitScript(() => {
    window.__betaPrintEvents = 0;
    window.__betaPdfEvents = 0;
    window.__betaDbsNetworkEvents = 0;
    window.addEventListener("verseform:print-preview", () => { window.__betaPrintEvents = (window.__betaPrintEvents ?? 0) + 1; });
    window.addEventListener("verseform:pdf-export", () => { window.__betaPdfEvents = (window.__betaPdfEvents ?? 0) + 1; });
    window.addEventListener("verseform:dbs-network-request", () => { window.__betaDbsNetworkEvents = (window.__betaDbsNetworkEvents ?? 0) + 1; });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const editor = page.getByRole("textbox", { name: "Document editor" });

  for (let cycle = 1; cycle <= 6; cycle += 1) {
    await editor.fill(`Cycle ${cycle}. John 3:16 `);
    await page.locator(".scripture-reference").click();
    await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, NASB)");

    await page.keyboard.press("Control+s");
    await expect.poll(() => page.title()).toBe("Untitled.verseform — Verseform");

    await page.keyboard.press("Control+p");
    await expect.poll(() => page.evaluate(() => window.__betaPrintEvents)).toBe(cycle);

    await chooseMenuItem(page, "File", /^Save PDF$/);
    const dialog = page.getByRole("dialog", { name: "Export PDF" });
    await expect(page.frameLocator('iframe[title="PDF export preview"]').locator("body")).toContainText(`Cycle ${cycle}.`);
    if (cycle % 2) {
      await dialog.getByRole("button", { name: "Cancel" }).click();
    } else {
      await dialog.getByRole("button", { name: /^Export PDF/ }).click();
      await expect.poll(() => page.evaluate(() => window.__betaPdfEvents)).toBe(cycle / 2);
    }

    await page.keyboard.press("Control+n");
    await expect(editor).toHaveText("");
  }

  const storage = await page.evaluate(() => ({
    documents: Object.keys(localStorage).filter((key) => key.startsWith("verseform.browser.document.")).length,
    recent: JSON.parse(localStorage.getItem("verseform.browser.recent") ?? "[]").length as number,
    networkRequests: window.__betaDbsNetworkEvents,
  }));
  expect(storage).toEqual({ documents: 6, recent: 6, networkRequests: 1 });
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(
    (key) => key.startsWith("verseform.browser.recovery."),
  ).length)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__VERSEFORM_DIAGNOSTICS__?.pendingOperationIds)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__VERSEFORM_DIAGNOSTICS__?.phases)).toEqual(expect.objectContaining({
    save: "idle",
    preview: "idle",
    insertion: "idle",
    output: "idle",
    overlay: "none",
  }));
});

test("restores the preferred translation and cached chapter across offline and online sessions", async ({ page }) => {
  await page.addInitScript(() => {
    window.__transitionNetworkRequests = 0;
    window.addEventListener("verseform:dbs-network-request", () => {
      window.__transitionNetworkRequests = (window.__transitionNetworkRequests ?? 0) + 1;
    });
  });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await selectScriptureTranslation(page, "ENGTEST");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, TEST)");
  await expect.poll(() => page.evaluate(() => window.__transitionNetworkRequests)).toBe(1);
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.title()).not.toContain("Unsaved changes");

  await page.goto("/?dbs=offline");
  await expectTranslation(page, "WEB");
  await expect(page.getByText("Offline · WEB", { exact: true })).toBeVisible();
  await editor.fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  expect(await page.evaluate(() => window.__transitionNetworkRequests)).toBe(0);
  await page.keyboard.press("Control+s");
  await expect.poll(() => page.title()).not.toContain("Unsaved changes");

  await page.goto("/");
  await expectTranslation(page, "ENGTEST");
  await editor.fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, TEST)");
  expect(await page.evaluate(() => window.__transitionNetworkRequests)).toBe(0);
});

test("keeps writing recoverable and commands available after repeated provider, save, and PDF failures", async ({ page }) => {
  await page.goto("/?dbs=chapter-failure&save=error&pdf=error");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  await expect(page.getByRole("status")).toContainText("bundled WEB");

  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Save failed: The destination is full or unavailable");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await chooseMenuItem(page, "File", /^Save PDF$/);
    const dialog = page.getByRole("dialog", { name: "Export PDF" });
    await dialog.getByRole("button", { name: /^Export PDF/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("PDF export failed: The selected PDF destination is not writable");
  }

  await expect(editor).toContainText("For God so loved the world");
  await expect.poll(() => page.title()).toContain("Unsaved changes");
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some(
    (key) => key.startsWith("verseform.browser.recovery."),
  ))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__VERSEFORM_DIAGNOSTICS__?.phases.output)).toBe("idle");
  await expect.poll(() => page.evaluate(() => window.__VERSEFORM_DIAGNOSTICS__?.enabledCommands)).toEqual(expect.arrayContaining([
    "file.save",
    "file.savePdf",
  ]));
});
