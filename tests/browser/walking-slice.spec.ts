import { expect, test } from "@playwright/test";

test("walks from a detected reference through attributed PDF output", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16");
  await expect(page.locator(".scripture-reference")).toHaveCount(0);
  await page.keyboard.press("Space");

  const reference = page.locator(".scripture-reference");
  await expect(reference).toHaveText("John 3:16");
  await reference.hover();
  const preview = page.getByRole("tooltip");
  await expect(preview).toContainText("For God so loved the world");
  await expect(preview).toContainText("World English Bible");

  await reference.click();
  await expect(editor).toContainText("For God so loved the world");
  await expect(page.locator(".scripture-citation")).toHaveText(
    "(John 3:16, WEB)",
  );
  await expect(page.locator(".scripture-reference")).toHaveCount(0);

  await editor.press("Control+z");
  await expect(editor).toHaveText("John 3:16 ");
  await expect(page.locator(".scripture-reference")).toHaveText("John 3:16");

  await editor.press("Control+Shift+z");
  await expect(page.locator(".scripture-citation")).toHaveText(
    "(John 3:16, WEB)",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Saved Untitled.verseform",
  );
  await page.getByRole("button", { name: "New" }).click();
  await expect(editor).toHaveText("");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Opened Untitled.verseform",
  );
  await expect(editor).toContainText("For God so loved the world");
  await expect(page.locator(".scripture-citation")).toHaveText(
    "(John 3:16, WEB)",
  );
  await expect(page.locator(".scripture-reference")).toHaveCount(0);

  const reopenedCitation = page.locator(".scripture-citation");
  await reopenedCitation.click({ position: { x: 18, y: 8 } });
  await page.keyboard.type("x");
  await expect(reopenedCitation).toContainText("x");
  await editor.press("Control+z");
  await expect(reopenedCitation).toHaveText("(John 3:16, WEB)");

  await page.getByRole("checkbox", { name: "Page number" }).check();
  await page.getByRole("button", { name: "Print / PDF" }).click();
  const printFrame = page.frameLocator('iframe[title="Print/PDF preview"]');
  await expect(printFrame.locator("body")).toContainText("Powered by DBS");
  await expect(printFrame.locator("body")).toContainText("World English Bible");
  await expect(printFrame.locator("body")).toContainText("Page 1");

  const pdf = await page.pdf({
    path: testInfo.outputPath("vfm-010-print-sample.pdf"),
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.byteLength).toBeGreaterThan(5_000);
  await testInfo.attach("VFM-010 print sample", {
    body: pdf,
    contentType: "application/pdf",
  });
});

test("rejects a passage response after the document changes", async ({ page }) => {
  await page.goto("/?lookupDelay=350");
  await page.getByRole("combobox", { name: "Scripture translation" }).selectOption("ENGTEST");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  await page.locator(".scripture-reference").click();

  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type("changed");

  await expect(page.getByRole("status")).toContainText(
    "document changed during lookup",
  );
  await expect(page.locator(".scripture-citation")).toHaveCount(0);
  await expect(editor).toHaveText("John 3:16 changed");
});
