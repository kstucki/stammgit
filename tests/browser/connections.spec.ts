import { expect } from '@playwright/test';
import { test, login } from './support';
const fixture = { meta: { focusPersonId: 'a' }, people: {
  a: { name: 'Anna', partners: ['b'], siblings: ['s'], children: ['child'], parents: ['s'] },
  b: { name: 'Berta', partners: ['a'], parents: ['t'], children: ['child'] },
  child: { name: 'Kind', parents: ['a', 'b'], children: ['leaf'], parentDetails: { a: { type: 'adoptive' } } },
  s: { name: 'Schwester', siblings: ['a'], children: ['a'], partners: ['t'] },
  t: { name: 'Theo', partners: ['s'], children: ['b'] },
  leaf: { name: 'Seitenzweig', parents: ['child'] }, alone: { name: 'Unverbunden' },
} };

test('connections show all routes, preserve marriage and adopted child and support unlimited selection removal', async ({ page }, testInfo) => {
  await login(page);
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: fixture }));
  await page.goto('/');
  await expect(page.locator('.archive-navigation [data-view="connections"]')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Verbindungen', exact: true }).check();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  await expect(page.locator('[data-family-person="a"]')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Person hinzufügen' }).fill('Berta');
  await page.locator('[data-search-person="b"]').click();
  await expect(page.locator('[data-family-person]')).toHaveCount(4);
  await expect(page.locator('[data-partnership]')).toHaveCount(2);
  await expect(page.locator('[data-child="child"]')).toHaveCount(0);
  await expect(page.locator('[data-sibling-link]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="leaf"]')).toHaveCount(0);
  await expect(page.locator('.central-person')).toHaveCount(2);
  expect(await page.locator('[data-family-person]').evaluateAll(cards => new Set(cards.map(card => card.getAttribute('data-family-person'))).size)).toBe(4);
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('connections.png'), fullPage: true });
  // A selected child remains visible; removing its selection hides this redundant leaf.
  await page.locator('#connection-search').fill('Kind'); await page.locator('[data-search-person="child"]').click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  await expect(page.locator('[data-child="child"]')).toHaveCount(1);
  await expect(page.locator('[data-relationship-note="child"][data-parent="a"]')).toContainText('Adoption');
  await page.getByRole('button', { name: 'Aus Auswahl entfernen: Kind', exact: true }).click();
  await expect(page.locator('[data-family-person="child"]')).toHaveCount(0);
  await page.locator('#connection-search').fill('Unverbunden'); await page.locator('[data-search-person="alone"]').click();
  await expect(page.locator('.graph-tools [role="status"]')).toContainText('Keine dokumentierte Verbindung');
  await expect(page.locator('[data-family-person="alone"]')).toHaveCount(1);
  await page.reload(); await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Verkleinern', exact: true }).click();
  const zoom = await page.locator('[data-zoom-level]').innerText();
  await page.getByRole('radio', { name: 'Familie', exact: true }).check();
  await page.getByRole('radio', { name: 'Verbindungen', exact: true }).check();
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await page.reload();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await expect(page.locator('[data-zoom-level]')).toHaveText(zoom);
  await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  for (const name of ['Unverbunden', 'Berta', 'Anna']) await page.getByRole('button', { name: `Aus Auswahl entfernen: ${name}`, exact: true }).click();
  await expect(page.locator('[data-family-person]')).toHaveCount(0);
  await page.reload(); await expect(page.locator('[data-family-person]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('person action searches, cancels without changing selection, and resets to exactly the chosen pair', async ({ page }) => {
  await login(page, 'fixture-reader');
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: fixture }));
  await page.goto('/?view=connections&connect=a&connect=b&connect=alone');
  await page.getByRole('button', { name: 'Einpassen', exact: true }).click();
  await page.locator('[data-family-person="a"] .person-open').click();
  await page.getByRole('button', { name: 'Verbindung mit …', exact: true }).click();
  await page.locator('#connection-target').fill('Anna');
  await expect(page.locator('#connection-target-results [data-search-person="a"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Verbindung mit …', exact: true }).click();
  await page.locator('#connection-target').fill('Kind');
  await page.locator('#connection-target-results [data-search-person="child"]').click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(2);
  await expect(page.locator('[data-connection-selected="a"]')).toHaveCount(1);
  await expect(page.locator('[data-connection-selected="child"]')).toHaveCount(1);
  await expect(page.locator('[data-connection-selected="alone"]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="b"]')).toHaveCount(1);
  await expect(page.locator('#personDialog')).toHaveCount(0);
});

test('first connection tab uses the current tree center; dialog action works from the tree', async ({ page }) => {
  await login(page);
  await page.locator('#family-search').fill('Test Clara');
  await page.locator('[data-search-person="person_c"]').click();
  await page.getByRole('radio', { name: 'Verbindungen', exact: true }).check();
  await expect(page.locator('.family-view')).toHaveAttribute('data-mode', 'connections');
  await expect(page.locator('[data-family-person]')).toHaveCount(1);
  await expect(page.locator('[data-connection-selected="person_c"]')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Familie', exact: true }).check();
  await page.locator('[data-family-person="person_c"] .person-open').click();
  await page.getByRole('button', { name: 'Verbindung mit …', exact: true }).click();
  await page.locator('#connection-target').fill('Test Anna');
  await page.locator('#connection-target-results [data-search-person="person_a"]').click();
  await expect(page.locator('[data-connection-selected]')).toHaveCount(2);
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
});

test('ancestry outranks marriage in a large connection graph rendered by the worker', async ({ page }) => {
  await login(page);
  const people: Record<string, { name?: string; parents?: string[]; partners?: string[]; children?: string[] }> = {
    root: { children: ['a', 'b'] }, a: { parents: ['root'], children: ['branch_a'] },
    b: { parents: ['root'], children: ['c'] }, c: { parents: ['b'], children: ['spouse_a'] },
    branch_a: { name: 'Branch A', parents: ['a'], partners: ['spouse_a'], children: ['n0'] },
    spouse_a: { name: 'Spouse A', parents: ['c'], partners: ['branch_a'], children: ['n0'] },
  };
  for (let i = 0; i < 85; i++) people[`n${i}`] = { parents: i ? [`n${i-1}`] : ['branch_a', 'spouse_a'], children: i < 84 ? [`n${i+1}`] : [] };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'root' }, people } }));
  let workers = 0; page.on('worker', () => workers++);
  await page.goto('/?view=family&action=connections&connect=root&connect=n84');
  await expect(page.locator('[data-family-person]')).toHaveCount(91);
  expect(workers).toBeGreaterThan(0);
  const cards = await page.locator('[data-family-person="branch_a"], [data-family-person="spouse_a"], [data-family-person="n0"]').evaluateAll(elements => Object.fromEntries(elements.map(el => {
    const node = el.closest('.family-node') as HTMLElement;
    return [el.getAttribute('data-family-person'), { x: parseFloat(node.style.left), y: parseFloat(node.style.top), width: node.offsetWidth }];
  })));
  expect(cards.spouse_a.y).toBeGreaterThan(cards.branch_a.y);
  expect(cards.n0.y).toBeGreaterThan(cards.spouse_a.y);
  expect(cards.n0.y).toBeGreaterThan(cards.branch_a.y);
});

test('hiding a redundant child preserves the existing co-parent bridge without inventing a marriage', async ({ page }) => {
  await login(page);
  const people = { a: { children: ['child'] }, b: { children: ['child'] }, child: { parents: ['a', 'b'] } };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'a' }, people } }));
  await page.goto('/?view=family&action=connections&connect=a&connect=b');
  await expect(page.locator('[data-family-person]')).toHaveCount(2);
  await expect(page.locator('[data-child]')).toHaveCount(0);
  await expect(page.locator('[data-family-connection]')).toHaveCount(1);
  await expect(page.locator('[data-partnership]')).toHaveCount(0);
  await expect(page.locator('.graph-tools [role="status"]')).toHaveCount(0);
});

test('sisters stay together when their descendants marry across generations', async ({ page }) => {
  await login(page);
  const people = {
    root: { children: ['branch_a', 'branch_b'] },
    branch_a: { parents: ['root'], partners: ['spouse_a'], children: ['child_a'] },
    spouse_a: { partners: ['branch_a'], children: ['child_a'] },
    branch_b: { parents: ['root'], children: ['child_b'] },
    child_b: { parents: ['branch_b'], children: ['grandchild_b'] },
    grandchild_b: { parents: ['child_b'], partners: ['child_a'] },
    child_a: { parents: ['branch_a', 'spouse_a'], partners: ['grandchild_b'] },
  };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'branch_b' }, people } }));
  await page.goto('/?view=family&action=connections&connect=branch_b&connect=grandchild_b');
  await expect(page.locator('[data-family-person]')).toHaveCount(7);
  const y = (id: string) => page.locator(`[data-family-person="${id}"]`).evaluate(el => el.getBoundingClientRect().top);
  expect(await y('branch_a')).toBe(await y('branch_b'));
  expect(await y('branch_a')).toBe(await y('spouse_a'));
  expect(await y('child_a')).toBe(await y('child_b'));
  expect(await y('grandchild_b')).toBeGreaterThan(await y('child_a'));
  await expect(page.locator('[data-partnership]')).toHaveCount(2);
  await expect(page.locator('[data-child]')).toHaveCount(5);
});

test('a loop attached at one family point disappears and returns when selected', async ({ page }) => {
  await login(page);
  const people = {
    h: { name: 'Parent A', partners: ['i'], children: ['e', 'd'] },
    i: { name: 'Child B', partners: ['h'], parents: ['m'], children: ['e', 'd'] },
    e: { name: 'Descendant A', parents: ['h', 'i'], partners: ['u'] },
    d: { name: 'Descendant B', parents: ['h', 'i'] },
    u: { name: 'Grandchild B', partners: ['e', 'c'] },
    c: { name: 'Child A', partners: ['u'], parents: ['m'] }, m: { children: ['i', 'c'] },
  };
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: 'h' }, people } }));
  await page.goto('/?view=family&action=connections&connect=h&connect=d');
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  await expect(page.locator('[data-child="e"]')).toHaveCount(0);
  await expect(page.locator('[data-family-person="c"]')).toHaveCount(0);
  await expect(page.locator('[data-family-connection]')).toHaveCount(1);
  await page.locator('#connection-search').fill('Child A');
  await page.locator('[data-search-person="c"]').click();
  await expect(page.locator('[data-family-person]')).toHaveCount(7);
  await expect(page.locator('[data-child="e"]')).toHaveCount(1);
  await expect(page.locator('[data-partnership]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Aus Auswahl entfernen: Child A', exact: true }).click();
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('[data-family-person]')).toHaveCount(3);
});


test('wrapped connection selections extend the frame without shrinking the canvas', async ({ page }) => {
  await login(page);
  const ids = Array.from({ length: 12 }, (_, i) => `selected_${i}`);
  const people = Object.fromEntries(ids.map((id, i) => [id, {
    name: `Selected person ${i} with a deliberately long fixture name`,
    partners: ids.filter((_, j) => Math.abs(i - j) === 1),
  }]));
  await page.route('**/data/trees/demo.json', route => route.fulfill({ json: { meta: { focusPersonId: ids[0] }, people } }));
  const open = async (count: number) => {
    await page.goto('/?view=family&action=connections&' + ids.slice(0, count).map(id => `connect=${id}`).join('&'));
    await expect(page.locator('[data-connection-selected]')).toHaveCount(count);
    await expect.poll(() => page.locator('.graph-frame').evaluate(el =>
      Math.abs(parseFloat(el.style.getPropertyValue('--connection-controls-height')) - el.querySelector('.connection-controls')!.clientHeight)
    )).toBeLessThan(1);
    return page.locator('.family-viewport').boundingBox();
  };
  const before = (await open(2))!;
  const expanded = (await open(12))!;
  expect(expanded.y).toBeGreaterThan(before.y + 20);
  expect(expanded.height).toBeCloseTo(before.height, 0);
  const restored = (await open(2))!;
  expect(restored.y).toBeCloseTo(before.y, 0);
  expect(restored.height).toBeCloseTo(before.height, 0);
});
