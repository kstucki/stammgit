import { expect } from '@playwright/test';
import { test, login, selectGraphView, changeZoom, expectGraphFits } from './support';
async function centerMetrics(page: import('@playwright/test').Page) {
  return page.locator('.family-viewport').evaluate(v => {
    const view = v.getBoundingClientRect(), card = v.querySelector('.central-person')!.getBoundingClientRect();
    const panel = document.querySelector('#personDialog')?.getBoundingClientRect();
    const right = panel && panel.left > view.left && panel.left < view.right ? panel.left : view.right;
    const bottom = panel && panel.width >= view.width * .8 ? Math.min(view.bottom, panel.top) : view.bottom;
    return { x: (card.left + card.width / 2 - view.left) / (right - view.left), y: (card.top + card.height / 2 - view.top) / (bottom - view.top) };
  });
}
test('first visit shares the fitted family zoom with other card views', async ({ page }, info) => {
  await login(page, 'fixture-reader');
  await expect(page.locator('.graph-fit')).toBeEnabled();
  const children = Array.from({ length: 24 }, (_, i) => `child_${i}`);
  const people = Object.fromEntries([
    ['parent', { name: 'Test Parent', children }],
    ...children.map(id => [id, { name: `Test ${id}`, parents: ['parent'] }]),
  ]);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'child_12' }, people } }));
  await page.evaluate(() => { localStorage.removeItem('graphZoom'); sessionStorage.clear(); });
  await page.goto('/?view=family&person=child_12&action=family');
  await expectGraphFits(page);
  await expect(page.locator('.graph-fit')).toBeEnabled();
  const initialZoom = await page.locator('[data-zoom-level]').innerText();
  expect(await page.evaluate(() => Number(localStorage.getItem('graphZoom')))).toBeGreaterThan(0);
  expect(await page.evaluate(() => Number(localStorage.getItem('graphZoom')))).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath('fitted-start.png') });
  for (const mode of ['hourglass', 'descendants', 'connections', 'family']) {
    await selectGraphView(page, mode);
    await expect(page.locator('[data-zoom-level]')).toHaveText(initialZoom);
  }
  await page.reload();
  await expect(page.locator('[data-zoom-level]')).toHaveText(initialZoom);
  await expect.poll(async () => { const p = await centerMetrics(page); return Math.abs(p.x - .5) < .02 && Math.abs(p.y - .5) < .02; }).toBe(true);
});
test('card fitting becomes the saved zoom while fan interactions stay independent', async ({ page }) => {
  await login(page, 'fixture-reader');
  await expect(page.locator('.graph-fit')).toBeEnabled();
  await page.evaluate(() => localStorage.setItem('graphZoom', '0.42')); await page.reload();
  await expect(page.locator('[data-zoom-level]')).toHaveText('42 %');
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await expectGraphFits(page);
  const fitted = await page.locator('[data-zoom-level]').innerText();
  const saved = await page.evaluate(() => localStorage.getItem('graphZoom'));
  expect(saved).not.toBe('0.42');
  await page.locator('#family-search').fill('Bruno'); await page.locator('#family-search').press('Enter');
  await expect(page.locator('[data-zoom-level]')).toHaveText(fitted);
  await selectGraphView(page, 'ancestors'); await expectGraphFits(page);
  await changeZoom(page, 1.2);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('graphZoom'))).toBe(saved);
  await selectGraphView(page, 'family'); await expect(page.locator('[data-zoom-level]')).toHaveText(fitted);
});
test('a tiny saved zoom from a large graph enlarges smoothly in smaller views', async ({ page }) => {
  await login(page, 'fixture-reader');
  await expect(page.locator('.graph-fit')).toBeEnabled();
  await page.evaluate(() => localStorage.setItem('graphZoom', '0.025'));
  await page.reload();
  await expect(page.locator('[data-zoom-level]')).toHaveText('2.5 %');
  await selectGraphView(page, 'hourglass');
  await expect(page.locator('[data-zoom-level]')).toHaveText('2.5 %');
  await changeZoom(page, 1.2);
  await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('graphZoom')))).toBeCloseTo(.03, 6);
  await selectGraphView(page, 'family');
  await expect(page.locator('[data-zoom-level]')).toHaveText('3 %');
});
