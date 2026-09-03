import { expect, type Page } from "@playwright/test";

export async function chooseMenuItem(
  page: Page,
  menu: "File" | "Edit" | "Help",
  item: RegExp,
): Promise<void> {
  const button = page.getByRole("button", { name: menu, exact: true });
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  await page.getByRole("menuitem", { name: item }).click();
}

export async function togglePageNumbers(page: Page): Promise<void> {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Page numbers$/ }).click();
}

export function scriptureTranslation(page: Page) {
  return page.getByRole("button", { name: /^Scripture translation:/ });
}

export async function selectScriptureTranslation(page: Page, translationId: string): Promise<void> {
  const trigger = scriptureTranslation(page);
  await trigger.click();
  await page.getByRole("combobox", { name: "Search translations" }).fill(translationId);
  await page.getByRole("listbox", { name: "Available translations" }).getByRole("option").first().click();
  await expectTranslation(page, translationId);
}

export async function expectTranslation(page: Page, translationId: string): Promise<void> {
  await expect(scriptureTranslation(page)).toHaveAttribute("data-translation-id", translationId);
}
