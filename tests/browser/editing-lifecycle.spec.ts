import { expect, test } from "@playwright/test";
import { chooseMenuItem } from "./menu-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Tab changes paragraph indentation by exactly one level", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  const paragraph = editor.locator("p");
  await editor.click();
  await page.keyboard.type("Indented writing");

  await page.keyboard.press("Tab");
  await expect(paragraph).toHaveAttribute("data-indent", "1");
  await page.keyboard.press("Tab");
  await expect(paragraph).toHaveAttribute("data-indent", "2");
  await page.keyboard.press("Shift+Tab");
  await expect(paragraph).toHaveAttribute("data-indent", "1");
  await expect(editor).toBeFocused();
});

test("formats with keyboard and toolbar controls, then preserves formatting on reopen", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.press("Control+b");
  await page.keyboard.type("Bold");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" ");
  await page.keyboard.press("Control+i");
  await page.keyboard.type("Italic");
  await page.keyboard.press("Control+i");
  await page.keyboard.type(" ");
  await page.keyboard.press("Control+u");
  await page.keyboard.type("Underlined");
  await page.keyboard.press("Control+u");

  await page.keyboard.press("Control+a");
  await page.getByLabel("Font family").selectOption("Georgia");
  await page.getByLabel("Font size").selectOption("18pt");
  await page.getByLabel("Text color").fill("#123456");
  await page.getByLabel("Highlight color").fill("#fff0a8");
  page.once("dialog", (dialog) => dialog.accept("https://example.com"));
  await page.getByTitle("Add or edit link").click();
  await page.getByTitle("Align center").click();
  await chooseMenuItem(page, "Edit", /^Paragraph/);
  await page.getByLabel("Line spacing").selectOption("2");
  await page.getByLabel("Space before").selectOption("8");
  await page.getByLabel("Space after").selectOption("8");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByTitle("Indent").click();

  const paragraph = editor.locator("p");
  await expect(paragraph).toHaveAttribute("data-indent", "1");
  await expect(paragraph).toHaveAttribute("data-line-height", "2");
  await expect(paragraph).toHaveCSS("text-align", "center");
  await expect(editor.locator("strong")).toHaveText("Bold");
  await expect(editor.locator("em")).toHaveText("Italic");
  await expect(editor.locator("u")).toHaveText("Underlined");
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com");

  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Saved Untitled.verseform");
  await page.keyboard.press("Control+n");
  await page.keyboard.press("Control+o");
  await expect(editor.locator("strong")).toHaveText("Bold");
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com");
  await expect(editor.locator("p")).toHaveAttribute("data-indent", "1");

  await page.keyboard.press("Control+p");
  await expect(page.getByRole("status")).toContainText("Browser print preview opened");
  const printSurface = page.locator(".print-surface");
  await expect(printSurface.locator("strong").first()).toHaveText("Bold");
  await expect(printSurface.locator("a").first()).toHaveAttribute("href", "https://example.com");
  await expect(printSurface.locator("p").first()).toHaveCSS("text-align", "center");
});

test("find/replace and clean paste keep only safe writing markup", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("grace grace truth");
  await page.keyboard.press("Control+f");
  await page.getByLabel("Find", { exact: true }).fill("grace");
  await expect(page.locator(".find-match")).toHaveCount(2);
  await page.getByLabel("Replace", { exact: true }).fill("mercy");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(editor).toHaveText("mercy mercy truth");
  await expect(page.getByRole("status")).toContainText("Replaced 2 occurrences");

  await page.keyboard.press("Control+n");
  await page.getByRole("dialog").getByRole("button", { name: "Discard" }).click();
  await editor.click();
  await editor.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/html", '<p class="remote" style="color:red"><strong>Safe</strong><script>alert(1)</script> <a href="javascript:alert(2)">bad link</a> <a href="https://example.com" style="font-size:90px">good link</a></p>');
    data.setData("text/plain", "Safe bad link good link");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(editor.locator("strong")).toHaveText("Safe");
  await expect(editor.locator("a")).toHaveCount(1);
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com");
  await expect(editor.locator("[style], script")).toHaveCount(0);
  await expect(editor).toHaveAttribute("spellcheck", "true");
});

test("recovery survives restart, dirty actions are guarded, and existing files autosave", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("Accepted work before a restart");
  await expect(page.getByRole("status")).toContainText("Recovery copy saved locally");

  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Recovery available")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(editor).toHaveText("Accepted work before a restart");

  await page.keyboard.press("Control+n");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toHaveText("Accepted work before a restart");

  await page.keyboard.press("Control+s");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" plus autosaved work");
  await expect(page.getByRole("status")).toContainText("Autosaved Recovered.verseform");
  await expect.poll(() => page.title()).toBe("Recovered.verseform — Verseform");

  await page.reload();
  await page.keyboard.press("Control+o");
  await expect(editor).toHaveText("Accepted work before a restart plus autosaved work");
  await expect(page.getByLabel("Recent files")).toContainText("Recovered.verseform");
});
