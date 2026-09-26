import { expect } from '@playwright/test';
import { test, login, selectGraphView, changeZoom } from './support';
import type { Page } from '@playwright/test';

async function geometry(page: Page) {
  return page.locator('.family-node').evaluateAll(nodes => nodes.map(node => ({
    id: node.querySelector('[data-family-person]')!.getAttribute('data-family-person'),
    x: (node as HTMLElement).style.left, y: (node as HTMLElement).style.top,
  })));
}
for (const role of ['admin', 'reader']) test(`${role} uses TypeScript in every view without a comparison control`, async ({ page }) => {
  await login(page, `fixture-${role}`);
  await page.evaluate(() => localStorage.setItem('activeTree', 'complex'));
  await page.goto('/?view=family&layoutEngine=legacy');
  await changeZoom(page, 1.2);
  const zoom = await page.locator('[data-zoom-level]').innerText();
  for (const mode of ['family', 'hourglass', 'descendants', 'ancestors', 'connections']) {
    await selectGraphView(page, mode);
    await expect(page.locator('.family-view')).toHaveAttribute('data-layout-engine', 'typescript');
    await expect(page.locator('[data-family-person]').first()).toBeVisible();
    await expect(page.locator('.engine-comparison')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Layoutvergleich (temporär)' })).toHaveCount(0);
    await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  }
  const before = await geometry(page);
  await page.reload();
  await expect(page.locator('.family-view')).toHaveAttribute('data-layout-engine', 'typescript');
  await expect.poll(() => geometry(page)).toEqual(before);
});


test('default layout keeps a couple outside another family’s sibling group', async ({ page }) => {
  await login(page);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: {
    meta: { focusPersonId: 'ancestor' }, people: {
      ancestor: { name: 'Ancestor', children: ['parent_a', 'parent_b'] },
      parent_a: { name: 'Parent A', parents: ['ancestor'], children: ['s1', 's2', 's3'] },
      parent_b: { name: 'Parent B', parents: ['ancestor'], children: ['partner_a'] },
      s1: { name: 'Sibling One', parents: ['parent_a'], birth: '2000' },
      s2: { name: 'Sibling Two', parents: ['parent_a'], birth: '1990' },
      s3: { name: 'Sibling Three', parents: ['parent_a'] },
      partner_a: { name: 'Partner A', parents: ['parent_b'], partners: ['partner_b'], children: ['child'] },
      inlaw: { name: 'Additional Parent', children: ['partner_b'] },
      partner_b: { name: 'Partner B', parents: ['inlaw'], partners: ['partner_a'], children: ['child'] },
      child: { name: 'Child', parents: ['partner_a', 'partner_b'] },
    },
  } }));
  await page.goto('/?view=family&person=ancestor&action=descendants');
  await expect(page.locator('[data-family-person]')).toHaveCount(9);
  await expect(page.locator('.family-view')).toHaveAttribute('data-layout-engine', 'typescript');
  const positions = await geometry(page);
  const row = positions.filter(n => n.y === positions.find(n => n.id === 's1')!.y).sort((a,b) => parseFloat(a.x)-parseFloat(b.x));
  const indices = ['s1', 's2', 's3'].map(id => row.findIndex(n => n.id === id)).sort((a,b) => a-b);
  expect(indices[0]).toBeGreaterThanOrEqual(0);
  expect(indices[2]-indices[0]).toBe(2);
  const x = (id: string) => parseFloat(positions.find(n => n.id === id)!.x);
  expect(Math.abs(x('partner_a')-x('partner_b'))).toBeCloseTo(256, 6);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.locator('[data-family-person="partner_b"] [data-expand="parents"]').click();
  await expect(page.locator('[data-family-person]')).toHaveCount(10);
  const expanded = await geometry(page);
  const expandedX = (id: string) => parseFloat(expanded.find(n => n.id === id)!.x);
  expect(Math.abs(expandedX('partner_a')-expandedX('partner_b'))).toBeCloseTo(256, 6);
  await page.reload();
  await expect.poll(() => geometry(page)).toEqual(positions);
});
