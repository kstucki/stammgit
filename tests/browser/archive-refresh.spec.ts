import { expect } from '@playwright/test';
import { test, login, openGraphPerson } from './support';

test('person info keeps full family names, internal back and empty sections', async ({ page }) => {
  await login(page, 'fixture-reader');
  await openGraphPerson(page, 'person_a');
  const panel = page.locator('#personDialog');
  await expect(panel.locator('[data-person-kinship]')).toHaveCount(0);
  await expect(panel.locator('[data-edit-person]')).toHaveCount(0);
  await expect(panel.locator('[data-info-person="person_b"]')).toHaveText('Test Bruno');
  await panel.locator('[data-info-person="person_b"]').click();
  await expect(panel.locator('.person-info-heading')).toContainText('Test Bruno');
  await expect(panel.locator('.person-stories, [data-info-sources]')).toHaveCount(0);
  await panel.locator('.person-info-back').click();
  await expect(panel.locator('.person-info-heading')).toContainText('Test Anna');
});

test('chronicle subtitle editing, cards, quote attribution and admin book print', async ({ page }) => {
  await login(page);
  await page.route('**/chronicle/demo/intro.md', route => route.fulfill({ contentType: 'text/markdown', body:
    '---\ntitle: Testgeschichte\nsubtitle: Menschen und Orte\nauthor: Test Author\nyear: 2026\n---\n\n> Eine Erinnerung.\n> — [[p:person_a]]\n\n[[s:/sources/test.pdf|Dokument]] – Ein Zeitdokument.\n\n![Porträt](/photos/test.png "schmal")\n\nBildunterschrift.' }));
  await page.goto('/?view=chronicle');
  await expect(page.locator('.chronicle-titlepage img')).toHaveCount(0);
  await expect(page.locator('.archive-header input')).toHaveCount(0);
  await page.locator('[data-chapter="intro.md"]').click();
  await expect(page.locator('.chapter-subtitle')).toHaveText('Menschen und Orte');
  await expect(page.locator('blockquote cite')).toContainText('Test Anna');
  await expect(page.locator('.chronicle-document')).toHaveCount(1);
  await page.locator('#chapterEdit').click();
  await expect(page.locator('#chSubtitle')).toHaveValue('Menschen und Orte');
  await page.locator('#chSubtitle').fill('Neue Beschreibung');
  await page.locator('#chSave').click();
  await expect(page.locator('.chapter-subtitle')).toHaveText('Neue Beschreibung');
  await page.goto('/?view=admin');
  await page.evaluate(() => { (window as unknown as { printed: boolean }).printed = false; window.print = () => { (window as unknown as { printed: boolean }).printed = true; }; });
  await page.locator('[data-print-book]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true);
  await expect(page.locator('.print-chapter .chapter-subtitle')).toHaveText('Neue Beschreibung');
  await expect(page.locator('.chronicle-print-book')).toContainText('Test Author');
});
