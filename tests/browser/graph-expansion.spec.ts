import { expect } from '@playwright/test';
import { changeZoom, test, login } from './support';
const data = { meta: { focusPersonId: 'a' }, people: {
  aunt: { name: 'Aunt', parents: ['grand'] }, grand: { name: 'Grand', children: ['parent', 'aunt'] }, parent: { name: 'Parent', parents: ['grand'], children: ['a'] },
  a: { name: 'Anna', parents: ['parent'], partners: ['b'], children: ['child'] },
  b: { name: 'Berta', partners: ['a'], children: ['child'] },
  child: { name: 'Child', parents: ['a', 'b'], children: ['leaf'] }, leaf: { name: 'Leaf', parents: ['child'] },
} };
test('card focuses, info opens, and one-hop arrows preserve zoom and connection selection', async ({ page, isMobile }) => {
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: data }));
  await page.goto('/?view=family&action=connections&connect=a&connect=b');
  await changeZoom(page, 1 / 1.2);
  const zoom = await page.locator('[data-zoom-level]').innerText();
  const a = page.locator('[data-family-person="a"]');
  await expect(a.locator('[data-expand="children"]')).toHaveCount(1);
  await expect(a.locator('[data-expand="partners"]')).toHaveCount(0);
  const reveal = a.locator('[data-expand="children"]');
  if (isMobile) await reveal.tap(); else await reveal.click();
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  await expect(page.locator('[data-child="child"]')).toHaveCount(1);
  await expect(page.locator('[data-family-person="leaf"]')).toHaveCount(0);
  await expect(page.locator('[data-connection-selected]')).toHaveCount(2);
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await expect(page.locator('#personDialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Nur Verbindungen', exact: true }).click();
  await expect(page.locator('[data-family-person]')).toHaveCount(2);
  await expect(page.locator('[data-child]')).toHaveCount(0);
  await a.locator('.person-open').click();
  await expect(page.getByRole('dialog')).toContainText('Anna');
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await page.locator('#personDialog .dialog-close').click();
  const b = page.locator('[data-family-person="b"] .person-focus');
  if (isMobile) await b.tap(); else await b.click();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'family');
  await expect(page.locator('.central-person')).toHaveAttribute('data-family-person', 'b');
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await page.getByRole('radio', { name: 'Verbindung', exact: true }).check();
  await expect(page.locator('[data-connection-selected="a"]')).toHaveCount(1);
  await expect(page.locator('[data-connection-selected="b"]')).toHaveCount(1);
});
for (const mode of ['Familie', 'Ahnen', 'Nachkommen', 'Sanduhr']) {
  test(`expansion works in ${mode} and resets on view changes`, async ({ page }) => {
    await login(page);
    await page.route('**/data/trees/demo.json', route => route.fulfill({ json: data }));
    await page.goto('/?view=family&person=child&action=family');
    await page.getByRole('radio', { name: mode, exact: true }).check();
    const arrow = page.locator('[data-expand]').first();
    const count = await page.locator('[data-family-person]').count();
    await arrow.click();
    await expect.poll(() => page.locator('[data-family-person]').count()).toBeGreaterThan(count);
    await expect(page.locator('.family-view')).toHaveAttribute('data-center', 'child');
    await expect(page.locator('#personDialog')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Verbindung', exact: true }).check();
    await page.getByRole('radio', { name: mode, exact: true }).check();
    await expect(page.locator('[data-family-person]')).toHaveCount(count);
  });
}
