import { expect, test } from "@playwright/test";
import type { DiagnosticSnapshot } from "../../src/app/selectors";

declare global {
  interface Window {
    __VERSEFORM_DIAGNOSTICS__?: DiagnosticSnapshot;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("exposes a frozen redacted browser diagnostic while commands use one overlay", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("private pastoral note");

  await expect.poll(() => page.evaluate(() => window.__VERSEFORM_DIAGNOSTICS__?.version)).toBe(1);
  const diagnostic = await page.evaluate(() => ({
    snapshot: window.__VERSEFORM_DIAGNOSTICS__,
    frozen: Object.isFrozen(window.__VERSEFORM_DIAGNOSTICS__)
      && Object.isFrozen(window.__VERSEFORM_DIAGNOSTICS__?.document),
    writable: Object.getOwnPropertyDescriptor(window, "__VERSEFORM_DIAGNOSTICS__")?.writable,
  }));
  expect(diagnostic.frozen).toBe(true);
  expect(diagnostic.writable).toBe(false);
  expect(diagnostic.snapshot?.document.dirty).toBe(true);
  expect(diagnostic.snapshot?.enabledCommands).toContain("file.save");
  expect(JSON.stringify(diagnostic.snapshot)).not.toContain("private pastoral note");
  expect(JSON.stringify(diagnostic.snapshot)).not.toContain("browser://");

  await page.keyboard.press("Control+f");
  await expect(page.getByRole("dialog", { name: "Find and replace" })).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => window.__VERSEFORM_DIAGNOSTICS__?.phases.overlay,
  )).toBe("find");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(
    () => window.__VERSEFORM_DIAGNOSTICS__?.phases.overlay,
  )).toBe("none");
});
