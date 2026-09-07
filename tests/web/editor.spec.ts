import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chooseMenuItem } from "../browser/menu-helpers";
import { parseVerseformDocument } from "../../src/core/document";

const editor = (page: Page) => page.getByRole("textbox", { name: "Document editor" });
const saved = (page: Page) => expect(page.locator(".web-document-name")).toContainText("Saved in this browser");
async function firstDraft(page: Page) {
  const picker = page.getByRole("combobox", { name: "Local drafts" });
  await expect(picker).toBeVisible();
  const path = await picker.locator("option").nth(1).getAttribute("value");
  await picker.selectOption(path!);
  return path!;
}
async function download(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download document", exact: true }).click();
  const file = await pending;
  return { file, document: parseVerseformDocument(await readFile((await file.path())!, "utf8")) };
}

test.beforeEach(async ({ context }) => {
  await context.route("https://arc.dbs.org/api/bible-text/**", (route) => route.abort("internetdisconnected"));
});

test("real browser drafts survive reload and portable import/download preserves scripture metadata", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?dbs=online&save=cancel&lookupDelay=99999");
  await editor(page).fill("Study notes. John 3:36-4:2 ");
  await page.locator(".scripture-reference").click();
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:36-4:2, WEB)");
  const text = await editor(page).innerText();
  await saved(page);
  await page.reload();
  await firstDraft(page);
  await expect(editor(page)).toHaveText(text);
  await expect(page.locator(".scripture-citation")).toHaveCount(1);
  const exported = await download(page);
  expect(JSON.stringify(exported.document)).toContain('"chapterEnd":4');
  expect(JSON.stringify(exported.document)).toContain("World English Bible");
  await chooseMenuItem(page, "File", /^New/);
  const picker = page.waitForEvent("filechooser");
  await chooseMenuItem(page, "File", /^Import/);
  await (await picker).setFiles((await exported.file.path())!);
  await expect(editor(page)).toHaveText(text);
  const reimported = await download(page);
  expect(reimported.document.documentId).not.toBe(exported.document.documentId);
  expect(reimported.document.content).toEqual(exported.document.content);
  expect(await page.evaluate(() => "__VERSEFORM_DIAGNOSTICS__" in window || "__TAURI_INTERNALS__" in window)).toBe(false);
  await expect(page.getByRole("link", { name: "Download for Windows" })).toHaveAttribute("href", /v0\.2\.3\/Verseform_0\.2\.3_x64-setup\.exe$/);
  expect(errors).toEqual([]);
});

test("a stale tab cannot overwrite a newer draft and can save an independent copy", async ({ page, context }) => {
  await page.goto("/");
  await editor(page).fill("Shared starting text");
  await saved(page);
  const other = await context.newPage();
  await other.goto("/");
  const originalPath = await firstDraft(other);
  await editor(page).fill("Newer writing in the first tab");
  await saved(page);
  await editor(other).fill("Different writing in the second tab");
  await expect(other.locator(".status-line")).toContainText("changed in another tab");
  await expect(editor(other)).toHaveText("Different writing in the second tab");
  other.once("dialog", (dialog) => dialog.accept("Second tab copy"));
  await chooseMenuItem(other, "File", /^Save a copy/);
  await saved(other);
  await expect(other.locator(".web-document-name")).toContainText("Second tab copy");
  await other.getByRole("combobox", { name: "Local drafts" }).selectOption(originalPath);
  await expect(editor(other)).toHaveText("Newer writing in the first tab");
});

test("quota failure keeps writing downloadable and recovery survives reopening", async ({ page, context }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof put>) {
      if (this.name === "drafts") throw new DOMException("Simulated full storage", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.goto("/");
  await editor(page).fill("Keep my writing after a failed save");
  await expect(page.locator(".status-line")).toContainText("Browser storage is full");
  await expect(page.locator(".web-document-name")).toContainText("Unsaved changes");
  const copy = await download(page);
  expect(JSON.stringify(copy.document.content)).toContain("Keep my writing after a failed save");
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByRole("region", { name: "Recovery available" })).toBeVisible();
  await reopened.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(editor(reopened)).toHaveText("Keep my writing after a failed save");
  await saved(reopened);
});

test("denied browser storage leaves download usable without pretending the draft was saved", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("Storage denied", "SecurityError"); } }));
  await page.goto("/");
  await editor(page).fill("A portable copy when storage is denied");
  await expect(page.locator(".status-line")).toContainText("Browser storage is unavailable");
  const copy = await download(page);
  expect(JSON.stringify(copy.document.content)).toContain("A portable copy when storage is denied");
  await expect(page.locator(".web-document-name")).toContainText("Unsaved changes");
});

test("the cached editor reopens offline with local drafts and real bundled WEB", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator(".web-offline-state")).toHaveText("Ready offline");
  await editor(page).fill("Offline study");
  await saved(page);
  await context.setOffline(true);
  await page.reload();
  await firstDraft(page);
  await expect(editor(page)).toHaveText("Offline study");
  await editor(page).fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(editor(page)).toContainText("For God so loved the world");
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  await saved(page);
  const copy = await download(page);
  expect(JSON.stringify(copy.document)).toContain("World English Bible");
});

test("a failed offline installation is visible while online editing still works", async ({ context, page }) => {
  await context.route("http://127.0.0.1:1440/index.html", (route) => route.abort("failed"));
  await page.goto("/");
  await expect(page.locator(".web-offline-state")).toHaveText("Offline reopening unavailable");
  await editor(page).fill("Online writing is still available");
  await saved(page);
});

test("browser PDF uses the frozen attributed pages and keeps output claims truthful", async ({ page }, testInfo) => {
  await page.goto("/");
  await editor(page).fill("Psalm 23 ");
  await page.locator(".scripture-reference").click();
  await saved(page);
  await chooseMenuItem(page, "File", /^Save PDF/);
  const dialog = page.getByRole("dialog", { name: "Save as PDF" });
  await expect(dialog).toContainText("Letter paper, 100% scale");
  await expect(dialog).toContainText("World English Bible");
  await expect(dialog.getByRole("button", { name: "Open print dialog" })).toHaveAttribute("aria-disabled", "false");
  await page.evaluate(() => {
    window.print = () => {
      const output = document.querySelector(".print-surface")?.textContent ?? "";
      document.documentElement.setAttribute("data-print-evidence", output.includes("Powered by DBS") && output.includes("World English Bible") ? "attributed" : "missing");
    };
  });
  await dialog.getByRole("button", { name: "Open print dialog" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-evidence", "attributed");
  await expect(page.locator(".status-line")).toContainText("handled by your browser");
  await expect(editor(page)).toContainText("The LORD is my shepherd");
  const pdf = await page.pdf({ path: testInfo.outputPath("web-attributed.pdf"), format: "Letter", preferCSSPageSize: true, printBackground: true });
  const loading = getDocument({ data: new Uint8Array(pdf) });
  const pdfDocument = await loading.promise;
  expect(pdfDocument.numPages).toBe(1);
  const content = await (await pdfDocument.getPage(1)).getTextContent();
  const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
  for (const expected of ["The LORD is my shepherd", "World English Bible", "Powered by DBS", "Psalms 23, WEB"]) expect(text).toContain(expected);
  expect(text).not.toMatch(/Download document|Download for Windows|Skip to document/);
  await loading.destroy();
  await editor(page).fill("New writing after the previous print");
  await expect(page.locator(".print-surface")).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".web-print-guide")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  const issues = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(issues.violations).toEqual([]);
});

test("import validation and slow file reading cannot replace newer writing", async ({ page }) => {
  await page.goto("/");
  const invalid = page.waitForEvent("filechooser");
  await chooseMenuItem(page, "File", /^Import/);
  await (await invalid).setFiles({ name: "broken.verseform", mimeType: "application/json", buffer: Buffer.from('{"format":"other"}') });
  await expect(page.locator(".status-line")).toContainText("Open failed");
  await expect(editor(page)).toHaveText("");
  await page.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = async function () {
      document.documentElement.setAttribute("data-import-reading", "true");
      await new Promise<void>((resolve) => window.addEventListener("test:finish-import", () => resolve(), { once: true }));
      return read.call(this);
    };
  });
  const file = page.waitForEvent("filechooser");
  await chooseMenuItem(page, "File", /^Import/);
  await (await file).setFiles("tests/fixtures/formatted-v2.verseform.json");
  await expect(page.locator("html")).toHaveAttribute("data-import-reading", "true");
  await editor(page).fill("New writing while the import was reading");
  await page.evaluate(() => window.dispatchEvent(new Event("test:finish-import")));
  await expect(page.locator(".status-line")).toContainText("Your writing changed while opening");
  await expect(editor(page)).toHaveText("New writing while the import was reading");
  await expect(page.getByRole("combobox", { name: "Local drafts" }).locator("option").filter({ hasText: "formatted-v2" })).toHaveCount(1);
  await saved(page);
});

test("an installed update waits for open tabs without interrupting writing", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator(".web-offline-state")).toHaveText("Ready offline");
  await editor(page).fill("Keep this draft open during an app update");
  await saved(page);
  await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js?update-test", { scope: "/", updateViaCache: "none" }); });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL)).toContain("update-test");
  await expect(editor(page)).toHaveText("Keep this draft open during an app update");
  await editor(page).press("End");
  await editor(page).pressSequentially(" and keep writing");
  await saved(page);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await firstDraft(reopened);
  await expect(editor(reopened)).toContainText("and keep writing");
});

test("web controls remain readable and keyboard reachable on a smaller desktop", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 680 });
  await page.goto("/");
  await editor(page).fill("Study together. John 3:16 ");
  await editor(page).press("F6");
  await expect(page.locator(".scripture-reference")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".scripture-citation")).toHaveCount(1);
  await saved(page);
  await page.getByText("Using Verseform", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your writing stays here" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "artifacts/vfm-180-web-help.png" });
  await page.getByText("Using Verseform", { exact: true }).click();
  await page.screenshot({ path: "artifacts/vfm-180-web-editor.png" });
  await testInfo.attach("Web editor", { path: "artifacts/vfm-180-web-editor.png", contentType: "image/png" });
});
