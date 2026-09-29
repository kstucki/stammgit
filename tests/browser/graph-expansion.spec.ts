import { expect } from '@playwright/test';
import { changeZoom, test, login } from './support';
import type { Dataset } from '../../src/domain/person';
const data = { meta: { focusPersonId: 'a' }, people: {
  aunt: { name: 'Aunt', parents: ['grand'] }, grand: { name: 'Grand', children: ['parent', 'aunt'] }, parent: { name: 'Parent', parents: ['grand'], children: ['a'] },
  a: { name: 'Anna', parents: ['parent'], partners: ['b'], children: ['child'] },
  b: { name: 'Berta', partners: ['a'], children: ['child'] },
  child: { name: 'Child', parents: ['a', 'b'], children: ['leaf'] }, leaf: { name: 'Leaf', parents: ['child'] },
} };

for (const worker of [false, true]) {
  test(`expansion keeps the clicked non-central card fixed${worker ? ' across worker layout' : ''}`, async ({ page, isMobile }) => {
    const fixture: Dataset = structuredClone(data);
    if (worker) {
      for (let i = 0; i < 85; i++) {
        const id = `sibling${i}`;
        fixture.people[id] = { name: `Sibling ${i}`, parents: ['grand'] };
        fixture.people.grand.children!.push(id);
      }
    }
    await login(page, 'fixture-reader');
    await page.route('**/data/trees/demo.json', route => route.fulfill({ json: fixture }));
    await page.goto('/?view=family&person=a&action=family');
    await changeZoom(page, 1 / 1.2);
    const card = page.locator('[data-family-person="parent"]');
    const arrow = card.locator('[data-expand="parents"]');
    await arrow.scrollIntoViewIfNeeded();
    await expect(page.locator('.graph-fit')).toBeEnabled();
    // Place the source away from the viewport centre, so re-centring cannot pass.
    await card.evaluate(el => {
      const v = el.closest('.family-viewport')!, r = el.getBoundingClientRect(), b = v.getBoundingClientRect();
      v.scrollLeft += r.left + r.width / 2 - b.left - v.clientWidth * .62;
      v.scrollTop += r.top + r.height / 2 - b.top - v.clientHeight * .35;
    });
    const position = () => card.evaluate(el => {
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    const before = await position(), zoom = await page.locator('[data-zoom-level]').innerText();
    if (isMobile) await arrow.tap(); else await arrow.click();
    await expect(page.locator('[data-family-person="grand"]')).toHaveCount(1);
    await expect.poll(async () => {
      const after = await position(); return Math.max(Math.abs(after.x - before.x), Math.abs(after.y - before.y));
    }).toBeLessThan(1.1);
    await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);

    // A second expansion uses a new source, including crossing the worker threshold.
    const grand = page.locator('[data-family-person="grand"]');
    const children = grand.locator('[data-expand="children"]');
    await children.scrollIntoViewIfNeeded();
    const viewport = await page.locator('.family-viewport').elementHandle();
    const old = await grand.boundingBox();
    if (isMobile) await children.tap(); else await children.click();
    await expect(page.locator('[data-family-person="aunt"]')).toHaveCount(1);
    if (worker) await expect(page.locator('[data-family-person="sibling84"]')).toHaveCount(1);
    expect(await viewport!.evaluate(el => el.isConnected)).toBe(true);
    await expect.poll(async () => {
      const next = (await grand.boundingBox())!;
      return Math.max(Math.abs(next.x + next.width / 2 - old!.x - old!.width / 2), Math.abs(next.y + next.height / 2 - old!.y - old!.height / 2));
    }).toBeLessThan(1.1);
    await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  });
}
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
for (const mode of ['Familie', 'Nachkommen', 'Sanduhr']) {
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
