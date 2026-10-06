import { expect } from '@playwright/test';
import { test, login, selectGraphView, expectGraphFits } from './support';

test('hourglass depth, manual expansion, reset, persistence and unchanged fan', async ({ page }) => {
  const people: Record<string, { name: string; parents?: string[]; children?: string[] }> = {
    root: { name: 'Center', parents: ['a1'], children: ['d1'] },
  };
  for (let n = 1; n <= 12; n++) {
    people[`a${n}`] = { name: `Ancestor ${n}`, parents: n < 12 ? [`a${n + 1}`] : [], children: [n === 1 ? 'root' : `a${n - 1}`] };
    people[`d${n}`] = { name: `Descendant ${n}`, children: n < 12 ? [`d${n + 1}`] : [], parents: [n === 1 ? 'root' : `d${n - 1}`] };
  }
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'root' }, people } }));
  await page.goto('/?view=family&person=root&action=tree&root=root');
  const depth = page.getByLabel('Generationen', { exact: true });
  const card = (id: string) => page.locator(`[data-family-person="${id}"]`);
  await expect(depth).toHaveValue('5');
  await expect(card('a5')).toHaveCount(1);
  await expect(card('a6')).toHaveCount(0);
  await expect(card('d5')).toHaveCount(1);
  await expect(card('d6')).toHaveCount(0);
  await card('a5').locator('[data-expand="parents"]').click();
  await expect(card('a6')).toHaveCount(1);
  await expect(depth).toHaveValue('5');
  await depth.selectOption('2');
  await expect(card('a6')).toHaveCount(0);
  await expect(page.locator('[data-family-person]')).toHaveCount(5);
  await expectGraphFits(page);
  await depth.selectOption('12');
  await expect(page.locator('[data-family-person]')).toHaveCount(25);
  await expectGraphFits(page);
  await depth.selectOption('Infinity');
  await expect(card('a12')).toHaveCount(1);
  await expect(card('d12')).toHaveCount(1);
  await expectGraphFits(page);
  await page.reload();
  await expect(depth).toHaveValue('Infinity');
  await expect(card('a12')).toHaveCount(1);
  await selectGraphView(page, 'ancestors');
  await expect(depth).toHaveValue('5');
  await expect(depth.locator('option')).toHaveCount(10);
  await selectGraphView(page, 'hourglass');
  await expect(depth).toHaveValue('Infinity');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
