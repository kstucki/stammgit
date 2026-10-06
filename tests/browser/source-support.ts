import { expect, type Page } from '@playwright/test';
export async function openSource(page: Page, url = '/sources/test.pdf') {
  await page.locator(`[data-open-source="${url}"]`).click();
  const detail = page.locator('#sourceDialog .source-detail');
  await expect(detail).toBeVisible();
  return detail;
}
export async function selectSourceCategory(page: Page, key: string) {
  await expect(page.locator('.source-category-title')).toBeVisible();
  const select = page.locator('.source-mobile-category select');
  if (await select.isVisible()) await select.selectOption(key);
  else if (key === 'all') await page.locator('.source-nav button').first().click();
  else await page.locator(`[data-source-category="${key}"]`).click();
}
