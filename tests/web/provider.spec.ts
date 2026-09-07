import { expect, test } from "@playwright/test";
import { expectTranslation } from "../browser/menu-helpers";

const api = "https://arc.dbs.org/api/bible-text/";
const catalog = [{ abbr: "ENGNASB", title: "New American Standard Bible", copyright: "Recorded transport test notice." }];
const headers = { "access-control-allow-origin": "*", "content-type": "application/json" };

test("real web transport detects locally, fetches anonymous scripture, and reuses its IndexedDB cache offline", async ({ page, context }) => {
  let chapters = 0;
  await context.route(`${api}**`, async (route) => {
    const request = route.request();
    expect(request.headers()["authorization"]).toBeUndefined();
    expect(request.headers()["cookie"]).toBeUndefined();
    expect(request.headers()["referer"]).toBeUndefined();
    if (request.url() === api) return route.fulfill({ headers, body: JSON.stringify(catalog) });
    chapters++;
    expect(request.url()).toBe(`${api}ENGNASB/JHN/3`);
    await route.fulfill({ headers, body: JSON.stringify([{ "JN3.16": "Recorded John text from the transport fixture." }]) });
  });
  await page.goto("/");
  await expectTranslation(page, "ENGNASB");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("John 3:16 ");
  await expect(page.locator(".scripture-reference")).toHaveCount(1);
  expect(chapters).toBe(0);
  await page.locator(".scripture-reference").click();
  await expect(editor).toContainText("Recorded John text");
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, NASB)");
  expect(chapters).toBe(1);
  await expect(page.locator(".web-offline-state")).toHaveText("Ready offline");
  await expect(page.locator(".web-document-name")).toContainText("Saved in this browser");
  await context.setOffline(true);
  await page.reload();
  await expectTranslation(page, "ENGNASB");
  await editor.fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(editor).toContainText("Recorded John text");
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, NASB)");
  expect(chapters).toBe(1);
});

test("Job and 2 Peter stay in NASB through the canonical DBS book mapping", async ({ page, context }) => {
  const chapterRequests: string[] = [];
  await context.route(`${api}**`, async (route) => {
    const url = route.request().url();
    if (url === api) return route.fulfill({ headers, body: JSON.stringify(catalog) });
    chapterRequests.push(url);
    if (url === `${api}ENGNASB/JOB/21`) {
      return route.fulfill({ headers, body: JSON.stringify([{ "JB21.1": "Recorded Job text from NASB." }]) });
    }
    if (url === `${api}ENGNASB/2PE/3`) {
      return route.fulfill({ headers, body: JSON.stringify([{ "P23.8": "Recorded 2 Peter text from NASB." }]) });
    }
    return route.fulfill({ status: 404, headers, body: "[]" });
  });
  await page.goto("/");
  await expectTranslation(page, "ENGNASB");
  const editor = page.getByRole("textbox", { name: "Document editor" });
  await editor.fill("Job 21:1 ");
  await page.locator(".scripture-reference").click();
  await expect(editor).toContainText("Recorded Job text from NASB.");
  await expect(page.locator(".scripture-citation")).toHaveText("(Job 21:1, NASB)");
  await expectTranslation(page, "ENGNASB");

  await editor.fill("2 Pet 3:8 ");
  await page.locator(".scripture-reference").click();
  await expect(editor).toContainText("Recorded 2 Peter text from NASB.");
  await expect(page.locator(".scripture-citation")).toHaveText("(2 Peter 3:8, NASB)");
  await expectTranslation(page, "ENGNASB");
  expect(chapterRequests).toEqual([`${api}ENGNASB/JOB/21`, `${api}ENGNASB/2PE/3`]);
});

test("malformed provider data yields whole-passage WEB fallback without rendering provider markup", async ({ page, context }) => {
  await context.route(`${api}**`, (route) => route.fulfill({ headers, body: route.request().url() === api ? JSON.stringify(catalog) : '<script>alert("unsafe")</script>' }));
  await page.goto("/");
  await expectTranslation(page, "ENGNASB");
  await page.getByRole("textbox", { name: "Document editor" }).fill("John 3:16 ");
  await page.locator(".scripture-reference").click();
  await expect(page.getByRole("textbox", { name: "Document editor" })).toContainText("For God so loved the world");
  await expect(page.locator(".scripture-citation")).toHaveText("(John 3:16, WEB)");
  await expectTranslation(page, "WEB");
  await expect(page.locator(".status-line")).toContainText("WEB");
});
