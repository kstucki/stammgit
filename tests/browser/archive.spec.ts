import { expect } from '@playwright/test';
import { test, login, openGraphPerson, selectGraphView, expectFamilyHeightFits } from './support';

test('Svelte entry, existing tree, search, person window and return', async ({ page, isMobile }, testInfo) => {
  await login(page);
  await page.screenshot({ path: testInfo.outputPath('archive-home.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#svelte-app nav')).toBeVisible();
  await expect(page.locator('.archive-navigation [aria-current="page"]')).toHaveText('Stammbaum');
  await expect(page.locator('.person-count')).toHaveCount(0);
  await selectGraphView(page, 'hourglass');
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'hourglass');
  await expect(page.locator('#svelte-app')).toBeVisible();
  await expect(page.locator('script[src*="/assets/app.js"]')).toHaveCount(0);
  await expect(page.locator('.family-lines')).toBeVisible();
  await page.locator('#family-search').fill('Test Clara');
  await page.locator('[data-search-person="person_c"]').click();
  await openGraphPerson(page, 'person_c', isMobile);
  await expect(page.locator('#personDialog')).toBeVisible();
  await expect(page.locator('#personDialog')).toContainText('Test Clara');
  await page.locator('#personDialog .dialog-close').click();
  await selectGraphView(page, 'family');
  await expect(page.locator('#svelte-app nav')).toBeVisible();
  await expect(page.locator('#personDialog')).toHaveCount(0);
});

test('chronicle, person and source targets remain reachable', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /^Chronik/ }).click();
  await expect(page.locator('.archive-header input[type="search"]')).toHaveCount(0);
  await page.locator('.chronicle-toc [data-chapter="intro.md"]').click();
  await expect(page.locator('.archive-navigation').getByRole('link', { name: 'Stammbaum', exact: true })).toHaveAttribute('href', '/');
  await expect(page.getByRole('heading', { name: 'Testgeschichte', exact: true })).toBeVisible();
  await expect(page.locator('a.chronicle-source')).toHaveAttribute('href', '/sources/test.pdf');
  await page.locator('article [data-person="person_a"]').click();
  await expect(page.locator('#personDialog')).toContainText('Eine vorhandene Notiz.');
  await page.locator('#personDialog [data-info-chapters] summary').click();
  await expect(page.locator('#personDialog').getByRole('link', { name: 'Testgeschichte', exact: true })).toHaveAttribute('href', '/?view=chronicle&chapter=intro.md');
  await page.locator('#personDialog .dialog-close').click();
  await page.locator('article [data-section="anfang"]').click();
  await expect(page.locator('#anfang')).toBeInViewport();
});

test('sources and admin are accessible to admin', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: /^Quellen/ }).click();
  await page.locator('#sourcesSearch').fill('Testquelle');
  await expect(page.locator('.source-doc')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Dokument öffnen' })).toHaveAttribute('href', '/sources/test.pdf');
  await page.locator('[data-view="admin"]').click();
  await expect(page.locator('.archive-header input[type="search"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abmelden', exact: true })).toBeVisible();
  await expect(page.locator('#treeSelect')).toHaveValue('demo');
  await expect(page.locator('#adminSync')).toBeDisabled();
});

test('read-only role and unauthenticated requests retain server-side gates', async ({ page, request }) => {
  expect((await request.get('/data/trees/demo.json', { maxRedirects: 0 })).status()).toBe(302);
  await login(page, 'fixture-reader');
  await openGraphPerson(page, 'person_a');
  await expect(page.locator('#personDialog .person-actions > *')).toHaveCount(2);
  await expect(page.locator('#personDialog').getByRole('link', { name: 'Im Baum', exact: true })).toBeVisible();
  await expect(page.locator('#personDialog [data-edit-person]')).toHaveCount(0);
  await page.locator('#personDialog .dialog-close').click();
  await expect(page.locator('a[href$="view=admin"]')).toHaveCount(0);
  // Vite can also resolve source files below /public/ in development.
  expect((await page.request.post('/.netlify/functions/save-family', { data: {} })).status()).toBe(403);
  await page.goto('/legacy.html?view=admin');
  await expect(page.locator('.family-lines')).toBeVisible();
  await expect(page.locator('[data-view="admin"]')).toHaveCount(0);
});

test('a failed load offers a working retry', async ({ page }) => {
  await login(page);
  await page.route('**/data/config.json', route => route.fulfill({ status: 500, body: 'test failure' }));
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/data/config.json');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.locator('#svelte-app nav')).toBeVisible();
});

test('draft survives document changes and local sync survives a fresh browser context', async ({ page, browser, baseURL, isMobile, hasTouch, viewport, deviceScaleFactor, userAgent }, testInfo) => {
  await login(page);
  await selectGraphView(page, 'hourglass');
  await openGraphPerson(page, 'person_a', isMobile);
  await page.locator('#personDialog [data-edit-person]').click();
  const newOccupation = `Testberuf gespeichert ${testInfo.project.name}`;
  await page.locator('#personEditor [name="occupation"]').fill(newOccupation);
  await page.locator('#personEditor button[type="submit"]').click();
  await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
  await page.getByRole('link', { name: /^Admin/ }).click();
  await expect(page.locator('.draft-notice')).toBeVisible();
  const saved = page.waitForResponse(response => response.url().endsWith('/save-family'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#adminSync').click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.locator('#adminSync')).toBeDisabled();
  // Check the output of the real local save + data build, not a mocked response.
  const yaml = await page.request.get('/data/trees/demo.yaml');
  expect(await yaml.text()).toContain(newOccupation);

  const fresh = await browser.newContext({ baseURL, isMobile, hasTouch, viewport, deviceScaleFactor, userAgent });
  await fresh.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin
    ? route.continue() : route.abort());
  const reloaded = await fresh.newPage();
  const errors: string[] = [];
  reloaded.on('pageerror', error => errors.push(error.message));
  try {
    await login(reloaded);
    await expect(reloaded.locator('.draft-notice')).toHaveCount(0);
    await selectGraphView(reloaded, 'hourglass');
    await openGraphPerson(reloaded, 'person_a', isMobile);
    await expect(reloaded.locator('#personDialog')).toContainText(newOccupation);
    expect(errors).toEqual([]);
  } finally { await fresh.close(); }
});

for (const role of ['admin', 'reader']) {
  test(`person tree action opens the centered family and closes dialogs for ${role}`, async ({ page, isMobile }) => {
    await login(page, `fixture-${role}`);
    async function showFamily(id: string) {
      const dialog = page.locator('#personDialog');
      await expect(dialog.locator('[data-edit-person]')).toHaveCount(role === 'admin' ? 1 : 0);
      const action = dialog.getByRole('link', { name: 'Im Baum', exact: true });
      await expect(action).toHaveAttribute('data-show-family', id);
      await action.click();
      await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'family');
      await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', id);
      await expect(page.locator('#personDialog, #editDialog')).toHaveCount(0);
      // Center actions preserve the camera; fitting is now an explicit action.
      await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
      await expectFamilyHeightFits(page);
    }
    await selectGraphView(page, 'hourglass');
    await openGraphPerson(page, 'person_c', isMobile);
    await showFamily('person_c');
    await page.goto('/?view=chronicle&chapter=intro.md');
    await page.locator('article [data-person="person_a"]').click();
    // Following a relative within the dialog must update the action's target too.
    await page.locator('#personDialog [data-info-person="person_b"]').click();
    await showFamily('person_b');
    await page.reload();
    await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'person_b');
    await expect(page.locator('#personDialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Stammbaum', exact: true }).click();
    await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'person_b');
    await page.goto('/?view=sources');
    await page.locator('[data-open-person="person_a"]').first().click();
    await showFamily('person_a');

  });
}
