import { expect } from '@playwright/test';
import { test, login, selectGraphView, expectGraphFits } from './support';

test('descendant depth and person count follow expansion, reset and independent preferences', async ({ page }) => {
  const people: Record<string, { name: string; parents?: string[]; children?: string[]; partners?: string[] }> = {
    root: { name: 'Center', parents: ['ancestor'], children: ['d1'] },
    ancestor: { name: 'Ancestor', children: ['root'] },
    mate: { name: 'Partner', partners: ['d1'], children: ['step'] },
    step: { name: 'Stepchild', parents: ['mate'] },
  };
  for (let n = 1; n <= 12; n++) people[`d${n}`] = {
    name: `Descendant ${n}`, parents: [n === 1 ? 'root' : `d${n - 1}`],
    children: n < 12 ? [`d${n + 1}`] : [], ...(n === 1 ? { partners: ['mate'] } : {}),
  };
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'root' }, people } }));
  await page.goto('/?view=family&person=root&action=descendants');
  const depth = page.getByLabel('Generationen', { exact: true });
  const count = page.locator('.graph-person-count');
  const card = (id: string) => page.locator(`[data-family-person="${id}"]`);
  await expect(depth).toHaveValue('3');
  await expect(count).toHaveText('6 Personen');
  await expect(card('ancestor')).toHaveCount(0);
  await expect(card('d4')).toHaveCount(0);
  await expect(page.locator('[data-family-person]')).toHaveCount(6);
  await card('d3').locator('[data-expand="children"]').click();
  await expect(card('d4')).toHaveCount(1);
  await expect(count).toHaveText('7 Personen');
  await depth.selectOption('1');
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  await expect(count).toHaveText('3 Personen');
  await expectGraphFits(page);
  await depth.selectOption('12');
  await expect(count).toHaveText('15 Personen');
  await expectGraphFits(page);
  await depth.selectOption('Infinity');
  await expect(count).toHaveText('15 Personen');
  await page.reload();
  await expect(depth).toHaveValue('Infinity');
  await selectGraphView(page, 'hourglass');
  await expect(depth).toHaveValue('3');
  await expect(count).toHaveText('7 Personen');
  await selectGraphView(page, 'descendants');
  await expect(depth).toHaveValue('Infinity');
  await page.locator('#family-search').fill('Descendant 12');
  await page.locator('[data-search-person="d12"]').click();
  await expect(count).toHaveText('1 Person');
  await selectGraphView(page, 'family');
  await expect(count).toHaveCount(0);
});

test('generation selector and person count share one compact row', async ({ page }) => {
  await login(page, 'fixture-reader');
  for (const mode of ['hourglass', 'descendants']) {
    await selectGraphView(page, mode);
    const scope = page.locator('.graph-scope');
    await expect(scope.locator('select')).toHaveValue('3');
    await expect(page.locator('[data-family-person]').first()).toBeVisible();
    const n = await page.locator('[data-family-person]').count();
    await expect(scope.locator('output')).toHaveText(n === 1 ? '1 Person' : `${n} Personen`);
    const boxes = await scope.evaluate(el => {
      const select = el.querySelector('select')!.getBoundingClientRect();
      const count = el.querySelector('output')!.getBoundingClientRect();
      return { select: { x: select.x, right: select.right, center: select.y + select.height / 2 }, count: { x: count.x, right: count.right, center: count.y + count.height / 2 } };
    });
    expect(boxes.count.x).toBeGreaterThan(boxes.select.right);
    expect(Math.abs(boxes.count.center - boxes.select.center)).toBeLessThan(1);
    expect(boxes.count.right).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect((await page.locator('.graph-tools').boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.width >= 900 ? 62 : 112);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
