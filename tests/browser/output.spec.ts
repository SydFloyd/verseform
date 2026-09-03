import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chooseMenuItem, selectScriptureTranslation, togglePageNumbers } from "./menu-helpers";

declare global {
  interface Window {
    __lastPdfSnapshot?: { pageNumbers: boolean; notices: string[] };
    __outputProviderRequests?: number;
  }
}

async function pdfPageText(pdf: Buffer): Promise<string[]> {
  const loadingTask = getDocument({ data: new Uint8Array(pdf) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  await loadingTask.destroy();
  return pages;
}

test("reviews a frozen PDF accessibly and preserves the document through both cancellation paths", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.addEventListener("verseform:pdf-export", (event) => {
      window.__lastPdfSnapshot = (event as CustomEvent).detail;
    });
  });
  await page.goto("/?pdf=cancel");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Writing that must survive a canceled export.");
  await chooseMenuItem(page, "File", /^Save PDF$/);

  const dialog = page.getByRole("dialog", { name: "Export PDF" });
  const exportButton = dialog.getByRole("button", { name: /^Export PDF/ });
  const pageNumbers = dialog.getByRole("checkbox", { name: "Page numbers" });
  const preview = page.frameLocator('iframe[title="PDF export preview"]');
  await expect(dialog).toBeVisible();
  await expect(exportButton).toBeFocused();
  await expect(preview.locator("body")).toContainText("Writing that must survive a canceled export.");
  await pageNumbers.check();
  await expect(preview.locator("body")).toContainText("Page 1");
  await exportButton.press("Tab");
  await expect(pageNumbers).toBeFocused();
  await pageNumbers.press("Shift+Tab");
  await expect(exportButton).toBeFocused();
  const accessibility = await new AxeBuilder({ page })
    .include(".pdf-export-dialog")
    .exclude(".pdf-preview-frame")
    .setLegacyMode()
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  const screenshot = await page.screenshot({ path: "artifacts/vfm-110-pdf-export-dialog.png", fullPage: false });
  await testInfo.attach("PDF export dialog", { body: screenshot, contentType: "image/png" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("status")).toContainText("PDF export canceled");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeFocused();
  await expect(editor).toHaveText("Writing that must survive a canceled export.");
  await expect.poll(() => page.title()).toContain("Unsaved changes");
  expect(await page.evaluate(() => window.__lastPdfSnapshot)).toBeUndefined();

  await chooseMenuItem(page, "File", /^Save PDF$/);
  await page.getByRole("dialog", { name: "Export PDF" }).getByRole("button", { name: /^Export PDF/ }).click();
  await expect.poll(() => page.evaluate(() => window.__lastPdfSnapshot?.pageNumbers)).toBe(true);
  await expect(page.getByRole("status")).toContainText("PDF export canceled");
});

test("reports an unwritable PDF destination without changing open writing", async ({ page }) => {
  await page.goto("/?pdf=error");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Keep this exact writing after output failure.");
  await chooseMenuItem(page, "File", /^Save PDF$/);
  await page.getByRole("dialog", { name: "Export PDF" }).getByRole("button", { name: /^Export PDF/ }).click();

  await expect(page.getByRole("status")).toContainText("selected PDF destination is not writable");
  await expect(editor).toHaveText("Keep this exact writing after output failure.");
  await expect.poll(() => page.title()).toContain("Unsaved changes");
});

test("offline output makes no scripture-provider request", async ({ page }) => {
  await page.addInitScript(() => {
    window.__outputProviderRequests = 0;
    window.addEventListener("verseform:fake-provider-request", () => {
      window.__outputProviderRequests = (window.__outputProviderRequests ?? 0) + 1;
    });
  });
  await page.goto("/?dbs=offline");
  await page.getByRole("textbox", { name: "Document editor" })
    .fill("This output is available with no provider connection.");
  await chooseMenuItem(page, "File", /^Save PDF$/);
  await page.getByRole("dialog", { name: "Export PDF" }).getByRole("button", { name: /^Export PDF/ }).click();

  await expect(page.getByRole("status")).toContainText("Exported Untitled.pdf");
  expect(await page.evaluate(() => window.__outputProviderRequests)).toBe(0);
});

test("multi-page PDF contains every footer, notice, and optional page number", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await selectScriptureTranslation(page, "ENGTEST");
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, TEST)");

  await selectScriptureTranslation(page, "WEB");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Genesis 1:1 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveCount(2);

  await editor.click();
  await page.keyboard.press("Control+End");
  await editor.evaluate((element) => {
    const html = Array.from({ length: 54 }, (_, index) => (
      `<p><strong>Reflection ${index + 1}.</strong> Faithful output keeps the visible words, `
      + "paragraph rhythm, scripture citations, and their required attribution together.</p>"
    )).join("");
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "Representative multi-page Verseform output.");
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true, cancelable: true, clipboardData: data,
    }));
  });

  await togglePageNumbers(page);
  await chooseMenuItem(page, "File", /^Save PDF$/);
  await expect(page.frameLocator('iframe[title="PDF export preview"]').locator("body")).toContainText("Reflection 54.");
  await page.getByRole("dialog", { name: "Export PDF" }).getByRole("button", { name: /^Export PDF/ }).click();
  await expect(page.getByRole("status")).toContainText("Exported Untitled.pdf");

  const pdf = await page.pdf({
    path: process.env.VFM_050_PDF_OUTPUT
      ?? testInfo.outputPath("vfm-050-attributed-output.pdf"),
    format: "Letter",
    printBackground: true,
    preferCSSPageSize: true,
  });
  const pages = await pdfPageText(pdf);
  expect(pages.length).toBeGreaterThanOrEqual(3);
  for (const [index, text] of pages.entries()) {
    expect(text).toContain("Powered by DBS");
    expect(text).toContain("World English Bible (Public Domain)");
    expect(text).toContain("DBS test fixture — not production scripture.");
    expect(text).toContain(`Page ${index + 1}`);
  }
  expect(pages.join(" ")).toContain("Reflection 54.");
  await testInfo.attach("VFM-050 attributed PDF", { body: pdf, contentType: "application/pdf" });
});
