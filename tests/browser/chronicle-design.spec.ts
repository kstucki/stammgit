import { expect } from '@playwright/test';
import { test, login } from './support';

for (const [language, title] of [['de', 'Testgeschichte'], ['en', 'Test story'], ['pt', 'História de teste']]) {
  test(`chronicle typography and book export use ${language}`, async ({ page, isMobile }, info) => {
    await login(page);
    const file = `intro${language === 'de' ? '' : '.' + language}.md`;
    await page.goto(`/?view=chronicle&chapter=${file}&language=${language}`);
    await expect(page.locator('.chapter-heading h2')).toHaveText(title);
    const paragraph = page.locator('.chapter-content > p').first();
    expect((await paragraph.boundingBox())!.width).toBeLessThanOrEqual(640);
    expect(await paragraph.evaluate(e => getComputedStyle(e).fontSize)).toBe(isMobile ? '17px' : '18px');
    await expect(page.locator('[data-print-book]')).toHaveCount(0);
    await page.goto(`/?view=admin&language=${language}`);
    await expect(page.locator('#bookLanguage')).toHaveCount(0);
    await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printed = 'true'; }; });
    await page.locator('[data-print-book]').click();
    await expect(page.locator('html')).toHaveAttribute('data-printed', 'true');
    await expect(page.locator('.print-chapter')).toHaveCount(1);
    await expect(page.locator('.print-chapter .chapter-heading h2')).toHaveText(title);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.archive-header')).toBeHidden();
    await expect(page.locator('.admin-workspace')).toBeHidden();
    expect(await page.locator('.print-chapter').evaluate(e => getComputedStyle(e).breakBefore)).toBe('page');
    await expect(page.locator('.print-source-notes')).toBeVisible();
    await expect(page.locator('.print-source-notes')).toContainText('/sources/test.pdf');
    if (!isMobile) await page.pdf({ path: info.outputPath(`chronicle-${language}.pdf`), preferCSSPageSize: true });
  });
}

test('quote attribution, document fallback, narrow image and optional cover', async ({ page }) => {
  await login(page);
  await page.route('**/chronicle/demo/intro.md', route => route.fulfill({ contentType: 'text/markdown', body:
    '---\ntitle: Test\ncover: /photos/test.png\n---\n\n> Eine Erinnerung.\n> — [[p:person_a]] · [[s:/sources/missing-preview.pdf|Quelle]]\n\n[[s:/sources/missing-preview.pdf|Zeitdokument]] – Ein Dokument ohne Vorschau.\n\n![Porträt](/photos/test.png "schmal")\n\nBildunterschrift.' }));
  await page.goto('/?view=chronicle&chapter=intro.md');
  await expect(page.locator('blockquote cite')).toHaveText('Test Anna · Quelle', { useInnerText: true });
  await expect(page.locator('blockquote cite [data-person]')).toHaveAttribute('data-person', 'person_a');
  await expect(page.locator('.chronicle-document')).toHaveCount(1);
  await expect(page.locator('.document-preview')).toHaveText('▤');
  await expect(page.locator('.document-preview img')).toHaveCount(0);
  await expect(page.locator('.chronicle-figure-narrow figcaption')).toHaveText('Bildunterschrift.');
  await expect(page.locator('.chapter-cover')).toBeVisible();
});
