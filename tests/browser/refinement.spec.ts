import { expect, test } from "@playwright/test";
import { chooseMenuItem } from "./menu-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("presents familiar File and Edit menus with hidden secondary dialogs", async ({ page }) => {
  await expect(page.getByText("Local-first scripture writing", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Find and replace" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Paragraph" })).toHaveCount(0);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^New\b/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Open\b/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Save Ctrl\+S$/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Save As Ctrl\+Shift\+S$/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Print\b/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Save PDF$/ })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: "Page numbers" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "File menu" })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /^Undo\b/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Redo\b/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Find \/ Replace\b/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Paragraph/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+f");
  await expect(page.getByRole("dialog", { name: "Find and replace" })).toBeVisible();
  await expect(page.getByLabel("Find", { exact: true })).toBeFocused();
});

test("keeps formatting selectors and the window title synchronized with the document", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  const font = page.getByLabel("Font family");
  const size = page.getByLabel("Font size");

  await expect(font).toHaveValue("Garamond");
  await expect(size).toHaveValue("12pt");
  await expect(page.getByRole("combobox", { name: "Scripture translation" })).toHaveValue("ENGNASB");
  await expect.poll(() => page.title()).toBe("Untitled.verseform — Verseform");

  await editor.click();
  await page.keyboard.type("Styled writing");
  await page.keyboard.press("Control+a");
  await font.selectOption("Georgia");
  await size.selectOption("18pt");
  await expect(font).toHaveValue("Georgia");
  await expect(size).toHaveValue("18pt");
  await expect.poll(() => page.title()).toBe("Untitled.verseform — Unsaved changes — Verseform");

  await page.keyboard.press("Control+s");
  await expect.poll(() => page.title()).toBe("Untitled.verseform — Verseform");

  for (const label of [
    "Align left", "Align center", "Align right", "Justify",
    "Bullet list", "Numbered list", "Add or edit link",
  ]) {
    await expect(page.getByRole("button", { name: label }).locator("svg")).toHaveCount(1);
  }
  await expect(page.getByTitle("Font color").locator("svg")).toHaveCount(1);
  await expect(page.getByTitle("Highlight color").locator("svg")).toHaveCount(1);
});

test("applies paragraph settings from Edit and detects references after Enter", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16");
  await expect(page.locator(".scripture-reference")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page.locator(".scripture-reference")).toHaveText("John 3:16");

  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("A new paragraph");
  await chooseMenuItem(page, "Edit", /^Paragraph/);
  await page.getByLabel("Line spacing").selectOption("2");
  await page.getByLabel("Space before").selectOption("8");
  await page.getByLabel("Space after").selectOption("12");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(editor.locator("p").last()).toHaveAttribute("data-line-height", "2");
  await expect(editor.locator("p").last()).toHaveAttribute("data-space-before", "8");
  await expect(editor.locator("p").last()).toHaveAttribute("data-space-after", "12");
});
