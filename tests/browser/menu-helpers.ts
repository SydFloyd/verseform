import type { Page } from "@playwright/test";

export async function chooseMenuItem(
  page: Page,
  menu: "File" | "Edit",
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
