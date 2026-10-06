import { expect } from '@playwright/test';
import { test, login, changeZoom, expectGraphFits, selectGraphView } from './support';
import fs from 'node:fs';
import YAML from 'yaml';
const family = { meta: { focusPersonId: 'child' }, people: {
  child: { name: 'Alex Example', parents: ['father', 'mother', 'adoptive'], parentDetails: { father: { type: 'biological' }, mother: { type: 'biological' }, adoptive: { type: 'adoptive' } } },
  father: { name: 'Father Example', gender: 'm', parents: ['shared'], children: ['child'], birth: '1960' },
  mother: { name: 'Mother Example', gender: 'f', parents: ['shared'], children: ['child'], birth: '1965' },
  adoptive: { name: 'Adoptive Example', children: ['child'] }, shared: { name: 'Shared Ancestor', children: ['father', 'mother'], birth: '1930', death: '2010' },
} };
for (const role of ['reader', 'admin']) test(`fan works for ${role} with fixed positions, generation expansion and person information`, async ({ page }, info) => {
  await login(page, `fixture-${role}`);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: family }));
  await page.goto('/?view=family&person=child&action=family');
  await changeZoom(page, 1.2);
  const cardZoom = await page.evaluate(() => localStorage.getItem('graphZoom'));
  const cardLabel = await page.locator('[data-zoom-level]').innerText();
  await selectGraphView(page, 'ancestors');
  await expect(page.locator('.family-view')).toHaveAttribute('data-layout-engine', 'fan');
  await expectGraphFits(page);
  expect(await page.evaluate(() => localStorage.getItem('graphZoom'))).toBe(cardZoom);
  await page.getByLabel('Generationen', { exact: true }).selectOption('3');
  await expect(page.locator('[data-fan-slot]')).toHaveCount(15);
  await expect(page.locator('[data-fan-person="shared"]')).toHaveCount(2);
  await expect(page.locator('[data-fan-person="adoptive"]')).toHaveCount(0);
  await expect(page.locator('[data-fan-slot="4"] title')).toHaveText('Shared Ancestor, 1930–2010');
  await expect(page.locator('[data-fan-slot="4"]')).toHaveAttribute('aria-label', 'Shared Ancestor, 1930–2010');
  await expectGraphFits(page);
  await page.locator('[data-fan-slot="1"] circle').click();
  await expect(page.locator('#family-person-title')).toHaveText('Alex Example');
  await page.locator('#personDialog .dialog-close').click();
  const svgSize = await page.locator('.fan-svg').evaluate(el => [el.getAttribute('width'), el.getAttribute('height')]);
  expect(Number(svgSize[0])).toBeGreaterThan(Number(svgSize[1]));
  const father = page.locator('[data-fan-slot="2"]');
  await father.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#family-person-title')).toHaveText('Father Example');
  await page.locator('#personDialog .dialog-close').click();
  await page.getByLabel('Generationen', { exact: true }).selectOption('8');
  await expect(page.locator('[data-fan-slot]')).toHaveCount(511);
  await expect(page.locator('[data-fan-slot="2"]')).toHaveAttribute('data-fan-person', 'father');
  await expectGraphFits(page);
  const scale = await page.locator('[data-zoom-level]').innerText();
  await changeZoom(page, 1.2);
  await expect(page.locator('[data-zoom-level]')).not.toHaveText(scale);
  expect(await page.evaluate(() => localStorage.getItem('graphZoom'))).toBe(cardZoom);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click(); await expectGraphFits(page);
  await page.reload();
  await expect(page.locator('#personDialog')).toHaveCount(0);
  await expect(page.locator('.ancestor-fan')).toHaveAttribute('data-fan-depth', '8');
  await page.locator('#family-search').fill('Mother Example');
  await page.locator('[data-search-person="mother"]').click();
  await expect(page.locator('[data-fan-slot="1"]')).toHaveAttribute('data-fan-person', 'mother');
  await expectGraphFits(page);
  await selectGraphView(page, 'family');
  await expect(page.locator('[data-zoom-level]')).toHaveText(cardLabel);
  await page.locator('.graph-info summary').click();
  await expect(page.locator('.graph-info p')).toContainText('ihre Familie ins Zentrum');
  await expect(page.locator('.graph-info p')).toContainText('Pfeile');
  await selectGraphView(page, 'connections');
  await page.locator('.graph-info summary').click();
  await expect(page.locator('.graph-info p')).toContainText('Füge Personen über die Suche hinzu');

  await selectGraphView(page, 'ancestors');
  await expectGraphFits(page);
  await page.getByLabel('Generationen', { exact: true }).selectOption('3');
  await expectGraphFits(page);
  await page.screenshot({ path: info.outputPath('ancestor-fan.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('switching back to the fan always fits without overwriting manual reading zoom', async ({ page }) => {
  await login(page, 'fixture-reader');
  await changeZoom(page, 1.2);
  const manual = await page.locator('[data-zoom-level]').innerText();
  const saved = await page.evaluate(() => localStorage.getItem('graphZoom'));
  await selectGraphView(page, 'ancestors');
  await expectGraphFits(page);
  await changeZoom(page, 1.2);
  await page.locator('.family-viewport').evaluate(v => v.scrollBy(80, 70));
  await selectGraphView(page, 'family');
  await expect(page.locator('[data-zoom-level]')).toHaveText(manual);
  await selectGraphView(page, 'ancestors');
  await expectGraphFits(page);
  expect(await page.evaluate(() => localStorage.getItem('graphZoom'))).toBe(saved);
  await selectGraphView(page, 'descendants');
  await expect(page.locator('[data-zoom-level]')).toHaveText(manual);
  await page.goBack();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'ancestors');
  await expectGraphFits(page);
});

test('every generation change up to ten fits, including decreases after zooming', async ({ page }) => {
  await login(page, 'fixture-reader');
  await expect(page.locator('.graph-fit')).toBeEnabled();
  const saved = await page.evaluate(() => localStorage.getItem('graphZoom'));
  await selectGraphView(page, 'ancestors');
  for (const depth of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 4, 1, 10]) {
    await changeZoom(page, 1.2);
    await page.getByLabel('Generationen', { exact: true }).selectOption(String(depth));
    await expect(page.locator('[data-fan-slot]')).toHaveCount(2 ** (depth + 1) - 1);
    await expectGraphFits(page);
    expect(await page.evaluate(() => localStorage.getItem('graphZoom'))).toBe(saved);
  }
  await page.reload();
  await expect(page.locator('.ancestor-fan')).toHaveAttribute('data-fan-depth', '10');
  await expectGraphFits(page);
});
