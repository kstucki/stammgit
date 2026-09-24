import { expect } from '@playwright/test';
import { test, login } from './support';

const body = `Ein normaler Absatz vor den Bildern.

![Querformat](/photos/chronicle-landscape.svg)
[[p:person_a|Anna]] auf einem Gruppenfoto. [[s:/sources/test.pdf|Beleg]]

Ein eigenständiger Absatz nach der ersten Bildunterschrift.

[![Hochformat](/photos/chronicle-portrait.svg)](/sources/test.pdf)

Ein Porträt mit Verweis zum [[c:intro.md#anfang|Anfang]].

![Ohne Unterschrift](/photos/chronicle-landscape.svg)

## Weitere Erinnerungen

Mitten ![Kleines Symbol](/photos/chronicle-symbol.svg) im laufenden Text.
`;

test('chronicle pictures, captions, chapter navigation and preview share the reading column', async ({ page, isMobile }, testInfo) => {
  await page.route('**/data/chronicle-demo.json', async route => {
    const index = await (await route.fetch()).json();
    index.chapters = [index.chapters[0], { file: 'pictures.md', title: 'Bildgeschichte', persons: ['person_a'], sections: [] }, { file: 'end.md', title: 'Ausblick', persons: [], sections: [] }];
    await route.fulfill({ json: index });
  });
  await page.route('**/chronicle/demo/pictures.md', route => route.fulfill({ contentType: 'text/markdown', body: `---\ntitle: Bildgeschichte\n---\n\n${body}` }));
  await page.route('**/chronicle/demo/end.md', route => route.fulfill({ contentType: 'text/markdown', body: '---\ntitle: Ausblick\n---\n\nEin letztes Kapitel.' }));
  await page.route('**/photos/chronicle-*.svg', route => {
    const portrait = route.request().url().includes('portrait'), symbol = route.request().url().includes('symbol');
    const [width, height] = symbol ? [16, 16] : portrait ? [600, 900] : [1200, 800];
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#839889"/><rect x="10%" y="10%" width="80%" height="80%" fill="#d6dfcd"/></svg>` });
  });
  await login(page);
  await page.goto('/?view=chronicle&chapter=pictures.md');
  const figures = page.locator('article figure'), captions = figures.locator('figcaption');
  await expect(figures).toHaveCount(3);
  await expect(captions).toHaveText(['Anna auf einem Gruppenfoto. Beleg', 'Ein Porträt mit Verweis zum Anfang.']);
  await expect(page.locator('article > .chapter-content > p').filter({ hasText: 'Ein eigenständiger Absatz' })).toHaveCount(1);
  await expect(page.locator('article p img[alt="Kleines Symbol"]')).toHaveCount(1);
  await expect(figures.nth(1).locator('a').first()).toHaveAttribute('href', '/sources/test.pdf');
  await expect(captions.first().locator('.chronicle-source')).toHaveAttribute('href', '/sources/test.pdf');
  const images = figures.locator('img');
  await images.evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  const sizes = await images.evaluateAll(images => images.map(image => {
    const img = image as HTMLImageElement;
    return { width: img.clientWidth, height: img.clientHeight, ratio: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit };
  }));
  expect(sizes.every(size => size.fit === 'contain')).toBe(true);
  expect(sizes[0].width).toBe(sizes[1].width);
  if (isMobile) for (const size of sizes) expect(size.width / size.height).toBeCloseTo(size.ratio, 1);
  else { expect(sizes[0].height).toBe(sizes[1].height); expect(sizes[0].height).toBeLessThanOrEqual(448); }
  expect(await captions.evaluateAll(nodes => new Set(nodes.map(node => {
    const { fontSize, lineHeight, color } = getComputedStyle(node);
    return `${fontSize}|${lineHeight}|${color}`;
  })).size)).toBe(1);
  await captions.first().locator('[data-person]').click();
  await expect(page.locator('#personDialog')).toContainText('Test Anna');
  await page.locator('#personDialog .dialog-close').click();
  await captions.nth(1).locator('[data-chapter]').click();
  await expect(page.locator('#anfang')).toBeInViewport();
  await page.locator('.chronicle-nav [data-chapter="pictures.md"]').click();
  await expect(page.getByRole('heading', { name: 'Bildgeschichte', exact: true })).toBeVisible();
  const nav = page.locator('.chronicle-nav');
  await nav.scrollIntoViewIfNeeded();
  const article = (await page.locator('article').boundingBox())!, navigation = (await nav.boundingBox())!;
  expect(navigation.x).toBeCloseTo(article.x, 1);
  expect(navigation.width).toBeCloseTo(article.width, 1);
  const previous = (await nav.locator('[data-chapter="intro.md"]').boundingBox())!, next = (await nav.locator('[data-chapter="end.md"]').boundingBox())!;
  expect(next.x - (previous.x + previous.width)).toBeLessThanOrEqual(16);
  expect((previous.x + next.x + next.width) / 2).toBeCloseTo(article.x + article.width / 2, 1);
  await page.screenshot({ path: testInfo.outputPath('chronicle-navigation.png') });
  await nav.locator('[data-chapter="end.md"]').click();
  await expect(page.getByRole('heading', { name: 'Ausblick', exact: true })).toBeVisible();
  await nav.locator('[data-chapter="pictures.md"]').click();
  await page.locator('#chapterEdit').click();
  await expect(page.locator('#chBody')).toHaveValue(body.trim());
  await page.locator('#chPreviewBtn').click();
  await expect(page.locator('#chPreview figure')).toHaveCount(3);
  await expect(page.locator('#chPreview figcaption')).toHaveText(['Anna auf einem Gruppenfoto. Beleg', 'Ein Porträt mit Verweis zum Anfang.']);
  await page.locator('#chCancel').click();
  await expect(page.locator('.draft-notice')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
