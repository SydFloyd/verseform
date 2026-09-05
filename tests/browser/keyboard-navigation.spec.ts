import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("keyboard-only writing reaches references, menus, translation, and returns without changing Tab indentation", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to document editor" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await expect(editor).toBeFocused();

  await page.keyboard.type("John 3:16. John 3:99 ");
  const valid = page.getByRole("button", { name: /Preview and insert John 3:16/ });
  const invalid = page.getByRole("note", { name: /Invalid reference: John 3:99/ });
  await expect(valid).toHaveCount(1);
  await expect(invalid).toHaveCount(1);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.keyboard.press("F6");
  await expect(valid).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("DBS test verse 16 for JHN");
  await page.keyboard.press("Enter");
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, NASB)");
  await expect(editor).toBeFocused();

  await page.keyboard.press("Control+z");
  await expect(page.locator(".scripture-citation")).toHaveCount(0);
  await expect(valid).toHaveCount(1);
  await page.keyboard.press("F6");
  await expect(valid).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(invalid).toBeFocused();
  await expect(page.getByRole("tooltip")).toContainText("John 3 has verses 1–36; verse 99 does not exist");

  await page.keyboard.press("F6");
  const file = page.getByRole("button", { name: "File", exact: true });
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  const help = page.getByRole("button", { name: "Help", exact: true });
  await expect(file).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect(invalid).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeFocused();
  await page.keyboard.press("Shift+F6");
  await expect(file).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "File menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(file).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(edit).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Edit menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(help).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Help menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();

  await page.keyboard.press("Tab");
  const translation = page.getByRole("button", { name: /Scripture translation:/ });
  await expect(translation).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const search = page.getByRole("combobox", { name: "Search translations" });
  await expect(search).toBeFocused();
  await page.keyboard.type("WEB");
  await expect(page.getByRole("option", { name: /WEB — World English Bible/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(translation).toHaveText("WEB");
  await expect(translation).toBeFocused();

  await page.keyboard.press("F6");
  await expect(editor).toBeFocused();
  const paragraph = editor.locator("p");
  await page.keyboard.press("Tab");
  await expect(paragraph).toHaveAttribute("data-indent", "1");
  await page.keyboard.press("Shift+Tab");
  await expect(paragraph).not.toHaveAttribute("data-indent", "1");
  await expect(editor).toBeFocused();
});
