import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { chooseMenuItem } from "./menu-helpers";

async function reset(page: import("@playwright/test").Page, url = "/") {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("has no detectable WCAG A/AA violations in the ready editor", async ({ page }) => {
  await reset(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("keyboard users can skip controls, close previews, and stay inside confirmation", async ({ page }) => {
  await reset(page);
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to document editor" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await expect(editor).toBeFocused();

  await page.keyboard.type("John 3:16 ");
  const reference = page.locator(".scripture-reference");
  await reference.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await reference.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.keyboard.press("Control+f");
  await expect(page.getByLabel("Find", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Close find and replace" }).click();
  await expect(editor).toBeFocused();

  const fileButton = page.getByRole("button", { name: "File", exact: true });
  await chooseMenuItem(page, "File", /^New\b/);
  const dialog = page.getByRole("dialog", { name: "Save changes?" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const save = dialog.getByRole("button", { name: "Save" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(save).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(fileButton).toBeFocused();
});

test("rejects a document-sized paste without losing accepted writing", async ({ page }) => {
  test.setTimeout(60_000);
  await reset(page);
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Accepted writing");
  await editor.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "x".repeat(1_000_001));
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true, cancelable: true, clipboardData: data,
    }));
  });
  await expect(editor).toHaveText("Accepted writing");
  await expect(page.getByRole("status")).toContainText("not applied");
});

test("a full destination keeps unsaved writing recoverable", async ({ page }) => {
  await reset(page, "/?save=error");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Writing that survives a full destination");
  await expect(page.getByRole("status")).toContainText("Recovery copy saved locally");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Save failed: The destination is full or unavailable");
  await expect(page.getByLabel("Current document")).toContainText("Unsaved changes");
  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByLabel("Recovery available")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(editor).toHaveText("Writing that survives a full destination");
});

test("offline alpha flow inserts, saves, reopens, prints, and exports", async ({ page }) => {
  await reset(page, "/?dbs=offline");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Control+n");
  await page.keyboard.press("Control+o");
  await expect(editor).toContainText("For God so loved the world");
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("status")).toContainText("Windows print dialog opened");
  await chooseMenuItem(page, "File", /^Save PDF$/);
  await expect(page.getByRole("status")).toContainText("Exported Untitled.pdf");
  await expect(page.frameLocator('iframe[title="Print/PDF preview"]').locator("body"))
    .toContainText("Powered by DBS");
});
