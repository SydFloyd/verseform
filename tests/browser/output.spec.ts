import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chooseMenuItem, togglePageNumbers } from "./menu-helpers";

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

test("freezes output settings and preserves the document when Save PDF is canceled", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("verseform:pdf-export", (event) => {
      window.__lastPdfSnapshot = (event as CustomEvent).detail;
    });
  });
  await page.goto("/?pdf=cancel");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Writing that must survive a canceled export.");
  await togglePageNumbers(page);
  await chooseMenuItem(page, "File", /^Save PDF$/);

  await expect(page.getByRole("status")).toContainText("PDF export canceled");
  await expect(editor).toHaveText("Writing that must survive a canceled export.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Print/PDF preview"]').locator("body"))
    .toContainText("Page 1");
});

test("reports an unwritable PDF destination without changing open writing", async ({ page }) => {
  await page.goto("/?pdf=error");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Keep this exact writing after output failure.");
  await chooseMenuItem(page, "File", /^Save PDF$/);

  await expect(page.getByRole("status")).toContainText("selected PDF destination is not writable");
  await expect(editor).toHaveText("Keep this exact writing after output failure.");
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
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

  await expect(page.getByRole("status")).toContainText("Exported Untitled.pdf");
  expect(await page.evaluate(() => window.__outputProviderRequests)).toBe(0);
});

test("multi-page PDF contains every footer, notice, and optional page number", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await page.getByRole("combobox", { name: "Scripture translation" }).selectOption("ENGTEST");
  await editor.click();
  await page.keyboard.type("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, TEST)");

  await page.getByRole("combobox", { name: "Scripture translation" }).selectOption("WEB");
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
