import { expect } from '@playwright/test';
import { test, login, openGraphPerson, selectGraphView } from './support';

test('fixed tree surface, five labels, navigation, info and logout cancellation', async ({ page, isMobile }, info) => {
  await login(page);
  await expect(page.locator('.archive-identity')).toHaveCount(0);
  const bar = page.locator('.graph-view-switcher');
  await expect(bar.locator('.graph-mode-face > span')).toHaveText(['Familie', 'Sanduhr', 'Nachkommen', 'Ahnen', 'Verbindung']);
  expect(await bar.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  for (const face of await bar.locator('.graph-mode-face').all()) await expect(face).toBeInViewport({ ratio: 1 });
  const graph = (await page.locator('.graph-frame').boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(graph.y).toBeLessThanOrEqual(110);
  expect(graph.height / height).toBeGreaterThanOrEqual(.7);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, 500));
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const header = (await page.locator('.archive-header').boundingBox())!;
  const search = (await page.locator('#family-search').boundingBox())!;
  const logout = (await page.locator('.logout-button').boundingBox())!;
  expect(search.y).toBeGreaterThanOrEqual(header.y);
  expect(logout.x).toBeGreaterThan(search.x + search.width);
  if (isMobile) {
    await expect(page.getByRole('button', { name: 'Vergrössern', exact: true })).toBeHidden();
    expect((await page.locator('.archive-navigation').boundingBox())!.y).toBeGreaterThan(height - 100);
  } else {
    const nav = (await page.locator('.archive-navigation').boundingBox())!;
    expect(nav.x + nav.width).toBeLessThan(search.x);
    expect(nav.y + nav.height).toBeLessThanOrEqual(header.y + header.height);
  }
  await expect(page.locator('.graph-info')).not.toHaveAttribute('open');
  await page.locator('.graph-info summary').click();
  await expect(page.locator('.graph-info p')).toBeVisible();
  const url = page.url();
  page.once('dialog', async dialog => { expect(dialog.message()).toBe('Wirklich abmelden?'); await dialog.dismiss(); });
  await page.locator('.logout-button').click();
  await expect(page).toHaveURL(url);
  await expect(page.locator('.family-viewport')).toBeVisible();
  await page.screenshot({ path: info.outputPath('responsive-tree.png') });
});

test('person sheet/sidebar and tree-internal actions do not add history entries', async ({ page, isMobile }) => {
  await login(page, 'fixture-reader');
  const length = await page.evaluate(() => history.length);
  await openGraphPerson(page, 'person_a');
  const panel = page.locator('#personDialog');
  await expect(panel).toHaveAttribute('aria-modal', 'false');
  const box = (await panel.boundingBox())!;
  if (isMobile) {
    await expect(panel).toHaveAttribute('data-panel-level', 'full');
    expect(box.y).toBe(0);
    expect(box.height).toBe(page.viewportSize()!.height);
    await panel.locator('[data-sheet-toggle]').click();
    await expect(panel).toHaveAttribute('data-panel-level', 'collapsed');
  } else {
    expect(box.x).toBeGreaterThan(page.viewportSize()!.width / 2);
    expect(box.x + box.width).toBe(page.viewportSize()!.width);
  }
  await panel.locator('[data-show-family]').click();
  await expect(panel).toHaveCount(0);
  await selectGraphView(page, 'ancestors');
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test('chronicle person jump and Back restore chapter and scroll position', async ({ page }) => {
  await login(page);
  await page.route('**/chronicle/demo/intro.md', route => route.fulfill({ contentType: 'text/markdown', body:
    '---\ntitle: Testgeschichte\n---\n\n' + 'Langer Absatz für die Rücknavigation.\n\n'.repeat(60) + '[[p:person_a]]\n\n' + 'Weiterer Absatz.\n\n'.repeat(30) }));
  await page.locator('[data-view="chronicle"]').click();
  await page.locator('.chronicle-toc [data-chapter="intro.md"]').click();
  const person = page.locator('article [data-person="person_a"]');
  await person.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(500);
  await person.click();
  if (page.viewportSize()!.width < 900) {
    await expect(page.locator('#personDialog')).toHaveAttribute('data-panel-level', 'full');
    const box = (await page.locator('#personDialog').boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBe(page.viewportSize()!.height);
  }
  await page.locator('#personDialog [data-show-family]').click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'family');
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'person_a');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Testgeschichte', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
  await expect(page).toHaveURL(/chapter=intro.md/);
});

test('sources restore their filter and scroll position after a person jump', async ({ page }) => {
  await login(page);
  await page.route('**/data/trees/demo.json', async route => {
    const dataset = await (await route.fetch()).json();
    dataset.people.person_a.sources = Array.from({ length: 30 }, (_, i) => ({ label: `Rückkehr ${i}`, url: `/sources/return-${i}.pdf` }));
    await route.fulfill({ json: dataset });
  });
  await page.goto('/?view=sources');
  await page.locator('#sourcesSearch').fill('Rückkehr');
  const person = page.locator('.source-doc [data-open-person="person_a"]').last();
  await person.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => scrollY);
  expect(position).toBeGreaterThan(500);
  await person.click();
  if (page.viewportSize()!.width < 900) {
    await expect(page.locator('#personDialog')).toHaveAttribute('data-panel-level', 'full');
    const box = (await page.locator('#personDialog').boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBe(page.viewportSize()!.height);
  }
  await page.locator('#personDialog [data-show-family]').click();
  await expect(page.locator('.family-view')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sourcesSearch')).toHaveValue('Rückkehr');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position, 0);
});

test('two-finger pinch changes the shared reading scale without changing layout', async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await login(page);
  const viewport = page.locator('.family-viewport');
  const scale = () => page.locator('.family-plane').evaluate(e => new DOMMatrix(getComputedStyle(e).transform).a);
  const before = await scale();
  await viewport.evaluate(v => {
    const box = v.getBoundingClientRect();
    const touches = (distance: number) => [-1, 1].map((side, identifier) => new Touch({ identifier, target: v,
      clientX: box.left + box.width / 2 + side * distance / 2, clientY: box.top + box.height / 2 }));
    v.dispatchEvent(new TouchEvent('touchstart', { touches: touches(100), bubbles: true, cancelable: true }));
    v.dispatchEvent(new TouchEvent('touchmove', { touches: touches(120), bubbles: true, cancelable: true }));
    v.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }));
  });
  await expect.poll(scale).toBeCloseTo(before * 1.2, 4);
  await selectGraphView(page, 'hourglass');
  await expect.poll(scale).toBeCloseTo(before * 1.2, 4);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
